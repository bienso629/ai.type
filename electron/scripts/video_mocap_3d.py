#!/usr/bin/env python3
"""
AI.Type 3D Video Motion Capture Engine (NLF NeurIPS 2024 - Parametric SMPL 3D)
Hệ thống trích xuất chuyển động 3D tổng quát cho MỌI loại video (chạy bộ, đi bộ, đá võ,
nhảy múa xoay 360 độ, đứng né đạn, ngồi xổm, camera đứng yên hay camera quay vòng):
  1. Đo chuyển động nền thực tế bằng Optical Flow (Shi-Tomasi + PyrLK lọc thuận-nghịch)
     để phân biệt chính xác camera đang lia/quay vòng với nhân vật đang tự xoay người.
  2. Phân tích động học bàn chân tổng quát (sải cắt kéo trước-sau, biên độ nhấc chân,
     tốc độ cổ chân) để tự động phân biệt chuyển động đứng bám sàn với chạy bộ / đi bộ / đá / nhảy.
  3. Khi 2 chân đứng cố định: tự động tách góc máy + giải 2-Bone Analytical Leg IK khóa chặt 2 chân
     trên mặt sàn (0.00mm trượt). Khi chạy bộ / đi bộ / đá / nhảy: giữ nguyên 100% sải chân, nâng gối,
     bật nhảy và giữ chân trụ chạm mặt sàn Y = 0 tự nhiên.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import torch
import torchvision
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation as R


MODEL_URL = "https://huggingface.co/spaces/yanboding/MTVCrafter/resolve/main/nlf_l_multi_0.3.2.torchscript"

# 20 khớp giải phẫu chuẩn của SMPL khớp 1:1 với _resolveRigAnatomy trong SontinhSceneService
SMPL_JOINT_NAMES = [
    (0, "Hips"),
    (3, "Spine"),
    (6, "Spine1"),
    (9, "Spine2"),
    (12, "Neck"),
    (15, "Head"),
    (13, "LeftShoulder"),
    (16, "LeftArm"),
    (18, "LeftForeArm"),
    (20, "LeftHand"),
    (14, "RightShoulder"),
    (17, "RightArm"),
    (19, "RightForeArm"),
    (21, "RightHand"),
    (1, "LeftUpLeg"),
    (4, "LeftLeg"),
    (7, "LeftFoot"),
    (2, "RightUpLeg"),
    (5, "RightLeg"),
    (8, "RightFoot"),
]

SMPL_EDGES = [
    (0, 1), (1, 4), (4, 7), (7, 10),
    (0, 2), (2, 5), (5, 8), (8, 11),
    (0, 3), (3, 6), (6, 9), (9, 12), (12, 15),
    (9, 13), (13, 16), (16, 18), (18, 20), (20, 22),
    (9, 14), (14, 17), (17, 19), (19, 21), (21, 23),
]

# Ma trận chuyển hệ tọa độ từ OpenCV camera (+X phải, +Y xuống, +Z vào màn hình)
# sang PlayCanvas Canonical Studio (+X trái nhân vật, +Y lên, +Z trước mặt nhân vật).
CV_TO_PC = np.diag([1.0, -1.0, -1.0])


def emit_progress(percent: int, stage: str, done: int = 0, total: int = 0) -> None:
    payload = {
        "type": "progress",
        "percent": int(max(0, min(100, percent))),
        "stage": stage,
        "done": int(done),
        "total": int(total),
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def ensure_model(model_path: str) -> str:
    p = Path(model_path)
    if p.exists() and p.stat().st_size > 100_000_000:
        return str(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = str(p) + ".downloading"
    emit_progress(3, "Đang tải mô hình 3D SMPL (chỉ tải 1 lần duy nhất)...")

    def _reporthook(count, block_size, total_size):
        if total_size > 0:
            pct = min(14, 3 + int((count * block_size / total_size) * 11))
            emit_progress(pct, "Đang tải mô hình 3D SMPL (~470MB)...")

    urllib.request.urlretrieve(MODEL_URL, tmp_path, _reporthook)
    os.replace(tmp_path, str(p))
    return str(p)


def box_iou_xywh(a: np.ndarray, b: np.ndarray) -> float:
    ax1, ay1, aw, ah = a[:4]
    bx1, by1, bw, bh = b[:4]
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = max(1e-6, aw * ah + bw * bh - inter)
    return float(inter / union)


def select_primary_box(boxes_xywhs: np.ndarray, prev_box: np.ndarray | None, img_w: int, img_h: int) -> np.ndarray | None:
    if boxes_xywhs is None or len(boxes_xywhs) == 0:
        return None
    diag = math.hypot(img_w, img_h) + 1e-6
    best_idx = 0
    best_val = -1e9
    for i, b in enumerate(boxes_xywhs):
        x, y, w, h = float(b[0]), float(b[1]), float(b[2]), float(b[3])
        score = float(b[4]) if len(b) > 4 else 0.5
        if w < 12 or h < 12:
            continue
        cx, cy = x + 0.5 * w, y + 0.5 * h
        area_norm = (w * h) / max(1.0, img_w * img_h)
        if prev_box is None:
            center_dist = math.hypot((cx - img_w * 0.5) / img_w, (cy - img_h * 0.5) / img_h)
            val = area_norm * (0.4 + score) * (1.2 - 0.6 * center_dist)
        else:
            iou = box_iou_xywh(b, prev_box)
            pcx, pcy = prev_box[0] + 0.5 * prev_box[2], prev_box[1] + 0.5 * prev_box[3]
            dist = math.hypot(cx - pcx, cy - pcy) / diag
            val = 0.65 * iou + 0.35 * max(0.0, 1.0 - dist * 2.2) + 0.15 * min(1.0, area_norm * 4.0) + 0.08 * score
        if val > best_val:
            best_val = val
            best_idx = i
    return boxes_xywhs[best_idx, :4].astype(np.float32).copy()


def clamp_and_pad_box(box: np.ndarray, img_w: int, img_h: int, pad_ratio: float = 0.10) -> np.ndarray:
    x, y, w, h = float(box[0]), float(box[1]), float(box[2]), float(box[3])
    px = w * pad_ratio
    py = h * pad_ratio
    x1 = max(0.0, x - px)
    y1 = max(0.0, y - py)
    x2 = min(float(img_w), x + w + px)
    y2 = min(float(img_h), y + h + py)
    return np.array([x1, y1, max(16.0, x2 - x1), max(16.0, y2 - y1)], dtype=np.float32)


def smooth_quaternions(quats_xyzw: np.ndarray, sigma: float = 0.85) -> np.ndarray:
    n = len(quats_xyzw)
    if n <= 1:
        return quats_xyzw.copy()

    q = quats_xyzw.astype(np.float64).copy()
    for i in range(n):
        norm = np.linalg.norm(q[i])
        if norm > 1e-8:
            q[i] /= norm
        else:
            q[i] = np.array([0.0, 0.0, 0.0, 1.0])
        if i > 0 and float(np.dot(q[i], q[i - 1])) < 0.0:
            q[i] = -q[i]

    if n >= 3:
        for i in range(1, n - 1):
            d_prev = float(np.clip(abs(np.dot(q[i], q[i - 1])), 0.0, 1.0))
            d_next = float(np.clip(abs(np.dot(q[i], q[i + 1])), 0.0, 1.0))
            d_span = float(np.clip(abs(np.dot(q[i - 1], q[i + 1])), 0.0, 1.0))
            ang_prev = 2.0 * math.degrees(math.acos(d_prev))
            ang_next = 2.0 * math.degrees(math.acos(d_next))
            ang_span = 2.0 * math.degrees(math.acos(d_span))
            if ang_prev > 55.0 and ang_next > 55.0 and ang_span < 42.0:
                mid = q[i - 1] + q[i + 1]
                mn = np.linalg.norm(mid)
                if mn > 1e-8:
                    q[i] = mid / mn

    for i in range(1, n):
        if float(np.dot(q[i], q[i - 1])) < 0.0:
            q[i] = -q[i]

    if sigma > 0.05 and n >= 5:
        for c in range(4):
            q[:, c] = gaussian_filter1d(q[:, c], sigma=sigma, mode="nearest")
        norms = np.linalg.norm(q, axis=1, keepdims=True)
        norms = np.where(norms > 1e-8, norms, 1.0)
        q = q / norms

    return q


def _normalize(v: np.ndarray, fallback: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    if n < 1e-8:
        return fallback.copy()
    return v / n


def estimate_background_camera_motion(
    frames_bgr: list[np.ndarray],
    padded_boxes: list[np.ndarray],
    fov_deg: float = 55.0,
) -> dict:
    """
    Đo chuyển động thực tế của hậu cảnh (vùng nằm NGOÀI bounding box nhân vật)
    bằng Lucas-Kanade Optical Flow + kiểm tra thuận-nghịch (forward-backward error < 1.8px).
    Giúp phân biệt chính xác:
      - Camera đứng yên (tripod / cầm tay tĩnh) + nhân vật tự xoay/nhảy/chạy
      - Camera quay vòng / lia máy (orbit / pan) quanh nhân vật
    """
    n = len(frames_bgr)
    if n < 2:
        return {
            "cam_yaw_rad": np.zeros(n, dtype=np.float64),
            "net_pan_deg": 0.0,
            "total_pan_deg": 0.0,
            "mean_bg_flow_norm": 0.0,
            "is_camera_moving": False,
        }

    h, w = frames_bgr[0].shape[:2]
    focal_px = (w * 0.5) / math.tan(math.radians(fov_deg * 0.5))
    d_yaws = np.zeros(n, dtype=np.float64)
    flow_norms = []

    prev_gray = cv2.cvtColor(frames_bgr[0], cv2.COLOR_BGR2GRAY)
    for i in range(1, n):
        curr_gray = cv2.cvtColor(frames_bgr[i], cv2.COLOR_BGR2GRAY)
        mask = np.full((h, w), 255, dtype=np.uint8)
        for b in (padded_boxes[i - 1], padded_boxes[i]):
            bx, by, bw, bh = float(b[0]), float(b[1]), float(b[2]), float(b[3])
            mx, my = bw * 0.12, bh * 0.12
            x1 = max(0, int(round(bx - mx)))
            y1 = max(0, int(round(by - my)))
            x2 = min(w, int(round(bx + bw + mx)))
            y2 = min(h, int(round(by + bh + my)))
            mask[y1:y2, x1:x2] = 0

        if int(np.count_nonzero(mask)) < int(0.08 * w * h):
            mask[:, :] = 0
            border_x = max(12, int(w * 0.14))
            border_y = max(12, int(h * 0.14))
            mask[:border_y, :] = 255
            mask[h - border_y :, :] = 255
            mask[:, :border_x] = 255
            mask[:, w - border_x :] = 255

        pts0 = cv2.goodFeaturesToTrack(prev_gray, maxCorners=160, qualityLevel=0.02, minDistance=12, mask=mask)
        if pts0 is not None and len(pts0) >= 6:
            pts1, st1, _ = cv2.calcOpticalFlowPyrLK(prev_gray, curr_gray, pts0, None, winSize=(21, 21), maxLevel=3)
            pts0_back, st2, _ = cv2.calcOpticalFlowPyrLK(curr_gray, prev_gray, pts1, None, winSize=(21, 21), maxLevel=3)
            if pts1 is not None and pts0_back is not None:
                fb_err = np.linalg.norm((pts0 - pts0_back).reshape(-1, 2), axis=1)
                valid = (st1.reshape(-1) == 1) & (st2.reshape(-1) == 1) & (fb_err < 1.8)
                if int(np.count_nonzero(valid)) >= 5:
                    disp = (pts1[valid] - pts0[valid]).reshape(-1, 2)
                    med_dx = float(np.median(disp[:, 0]))
                    med_dy = float(np.median(disp[:, 1]))
                    d_yaws[i] = math.atan2(-med_dx, focal_px)
                    flow_norms.append(math.hypot(med_dx, med_dy) / max(1.0, float(w)))
        prev_gray = curr_gray

    cam_yaw = np.cumsum(d_yaws)
    net_pan_deg = float(abs(math.degrees(cam_yaw[-1] - cam_yaw[0])))
    total_pan_deg = float(np.sum(np.abs(np.degrees(d_yaws))))
    mean_flow = float(np.mean(flow_norms)) if flow_norms else 0.0
    is_camera_moving = (net_pan_deg >= 15.0) or (total_pan_deg >= 28.0 and mean_flow >= 0.012)
    return {
        "cam_yaw_rad": cam_yaw,
        "net_pan_deg": round(net_pan_deg, 1),
        "total_pan_deg": round(total_pan_deg, 1),
        "mean_bg_flow_norm": round(mean_flow, 4),
        "is_camera_moving": bool(is_camera_moving),
    }


def classify_motion_kinematics(
    j3d_pc_all: np.ndarray,
    hips_cam_mats: np.ndarray,
    sample_times: list[float],
    bg_cam_info: dict,
) -> dict:
    """
    Phân tích động học chân tổng quát trong hệ quy chiếu địa phương của xương chậu
    (bất biến hoàn toàn với hướng quay camera hay hướng chạy trái/phải/tiến/lùi):
      - Đo biên độ cắt kéo 2 cổ chân (scissor stride)
      - Đo độ chênh cao nhấc chân giữa trái và phải (foot lift)
      - Đo tốc độ vung cổ chân tương đối so với hông (ankle speed)
      - Kết hợp dữ liệu Optical Flow hậu cảnh để phân loại chính xác mọi loại video!
    """
    n = len(j3d_pc_all)
    if n < 3:
        return {
            "motion_type": "stationary_grounded",
            "motion_label": "Đứng tại chỗ bám sàn",
            "use_foot_lock": True,
            "use_camera_orbit_removal": bool(bg_cam_info.get("is_camera_moving")),
            "stride_range_m": 0.0,
            "foot_lift_p95_m": 0.0,
            "ankle_speed_med_mps": 0.0,
            "sign_flips": 0,
            "pelvis_yaw_span_deg": 0.0,
        }

    scissor_z = np.zeros(n, dtype=np.float64)
    lift_diff_y = np.zeros(n, dtype=np.float64)
    la_rel_hips = np.zeros((n, 3), dtype=np.float64)
    ra_rel_hips = np.zeros((n, 3), dtype=np.float64)
    raw_pelvis_yaws = np.zeros(n, dtype=np.float64)

    for i in range(n):
        p_left = hips_cam_mats[i][:, 0]
        yaw = math.atan2(float(p_left[2]), float(p_left[0]))
        raw_pelvis_yaws[i] = yaw
        r_unyaw = R.from_euler("y", yaw, degrees=False).as_matrix()
        j_local = (r_unyaw @ (j3d_pc_all[i] - j3d_pc_all[i][0]).T).T
        la_rel_hips[i] = j_local[7]
        ra_rel_hips[i] = j_local[8]
        scissor_z[i] = float(j_local[7, 2] - j_local[8, 2])
        lift_diff_y[i] = abs(float(j_local[7, 1] - j_local[8, 1]))

    pelvis_yaw_unwrapped = np.unwrap(raw_pelvis_yaws)
    pelvis_yaw_span_deg = float(math.degrees(np.max(pelvis_yaw_unwrapped) - np.min(pelvis_yaw_unwrapped)))

    stride_range_m = float(np.percentile(scissor_z, 95) - np.percentile(scissor_z, 5))
    stride_std_m = float(np.std(scissor_z))
    foot_lift_p95_m = float(np.percentile(lift_diff_y, 95))

    scissor_centered = scissor_z - float(np.median(scissor_z))
    sign_flips = 0
    prev_sign = 0
    for val in scissor_centered:
        if val > 0.12:
            s = 1
        elif val < -0.12:
            s = -1
        else:
            s = 0
        if s != 0:
            if prev_sign != 0 and s != prev_sign:
                sign_flips += 1
            prev_sign = s

    speeds_l, speeds_r = [], []
    for i in range(1, n):
        dt = max(1e-3, float(sample_times[i] - sample_times[i - 1]))
        speeds_l.append(float(np.linalg.norm(la_rel_hips[i] - la_rel_hips[i - 1])) / dt)
        speeds_r.append(float(np.linalg.norm(ra_rel_hips[i] - ra_rel_hips[i - 1])) / dt)
    ankle_speed_med = float(max(np.median(speeds_l), np.median(speeds_r))) if speeds_l else 0.0
    ankle_speed_p90 = float(max(np.percentile(speeds_l, 90), np.percentile(speeds_r, 90))) if speeds_l else 0.0

    is_locomotion = (
        (stride_range_m >= 0.38 and (sign_flips >= 1 or stride_std_m >= 0.13))
        or (stride_range_m >= 0.48)
        or (ankle_speed_med >= 0.95)
    )
    is_kick_or_jump = (
        (foot_lift_p95_m >= 0.26)
        or (ankle_speed_p90 >= 2.2 and stride_range_m >= 0.28)
    )

    bg_moving = bool(bg_cam_info.get("is_camera_moving", False))

    if is_locomotion:
        motion_type = "locomotion"
        motion_label = "Chạy bộ / Đi bộ (Chân tự do bám sàn)"
        use_foot_lock = False
        use_camera_orbit_removal = bg_moving and pelvis_yaw_span_deg >= 45.0
    elif is_kick_or_jump:
        motion_type = "dynamic_legs"
        motion_label = "Đá / Nhảy / Vũ đạo (Chân tự do)"
        use_foot_lock = False
        use_camera_orbit_removal = bg_moving and pelvis_yaw_span_deg >= 45.0
    else:
        motion_type = "stationary_grounded"
        use_foot_lock = True
        use_camera_orbit_removal = bg_moving or (pelvis_yaw_span_deg >= 50.0)
        motion_label = (
            "Đứng bám sàn + Tách góc quay camera"
            if use_camera_orbit_removal
            else "Đứng bám sàn (2 chân cố định)"
        )

    return {
        "motion_type": motion_type,
        "motion_label": motion_label,
        "use_foot_lock": bool(use_foot_lock),
        "use_camera_orbit_removal": bool(use_camera_orbit_removal),
        "stride_range_m": round(stride_range_m, 3),
        "foot_lift_p95_m": round(foot_lift_p95_m, 3),
        "ankle_speed_med_mps": round(ankle_speed_med, 3),
        "sign_flips": int(sign_flips),
        "pelvis_yaw_span_deg": round(pelvis_yaw_span_deg, 1),
    }


def solve_two_bone_leg_ik(
    p_hip: np.ndarray,
    p_ankle: np.ndarray,
    l_thigh: float,
    l_shin: float,
    pole_hint: np.ndarray,
    toe_out_deg: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    vec = p_ankle - p_hip
    dist_raw = float(np.linalg.norm(vec))
    min_d = max(0.08, abs(l_thigh - l_shin) + 0.03)
    max_d = (l_thigh + l_shin) * 0.992
    d = float(np.clip(dist_raw, min_d, max_d))
    dir_ha = _normalize(vec, np.array([0.0, -1.0, 0.0]))

    a = (l_thigh * l_thigh + d * d - l_shin * l_shin) / (2.0 * d)
    h = math.sqrt(max(0.0, l_thigh * l_thigh - a * a))

    pole_proj = pole_hint - float(np.dot(pole_hint, dir_ha)) * dir_ha
    if float(np.linalg.norm(pole_proj)) < 1e-5:
        pole_proj = np.array([0.0, 0.0, 1.0]) - float(dir_ha[2]) * dir_ha
    pole_dir = _normalize(pole_proj, np.array([0.0, 0.0, 1.0]))

    p_knee = p_hip + a * dir_ha + h * pole_dir
    v_thigh = _normalize(p_knee - p_hip, np.array([0.0, -1.0, 0.0]))
    v_shin = _normalize(p_ankle - p_knee, np.array([0.0, -1.0, 0.0]))

    hinge = np.cross(v_thigh, v_shin)
    if float(np.linalg.norm(hinge)) < 1e-4:
        hinge = np.cross(pole_dir, dir_ha)
    x_hinge = _normalize(hinge, np.array([1.0, 0.0, 0.0]))
    if x_hinge[0] < 0.0:
        x_hinge = -x_hinge

    y_t = -v_thigh
    z_t = _normalize(np.cross(x_hinge, y_t), np.array([0.0, 0.0, 1.0]))
    x_t = _normalize(np.cross(y_t, z_t), np.array([1.0, 0.0, 0.0]))
    r_thigh = np.column_stack([x_t, y_t, z_t])

    y_s = -v_shin
    z_s = _normalize(np.cross(x_hinge, y_s), np.array([0.0, 0.0, 1.0]))
    x_s = _normalize(np.cross(y_s, z_s), np.array([1.0, 0.0, 0.0]))
    r_shin = np.column_stack([x_s, y_s, z_s])

    r_foot = R.from_euler("y", toe_out_deg, degrees=True).as_matrix()
    return r_thigh, r_shin, r_foot, p_knee


def run_video_mocap(
    video_path: str,
    out_json_path: str,
    model_path: str,
    target_fps: float = 0.0,
    max_frames: int = 96,
    foot_mode: str = "auto",
    debug_vis_path: str = "",
) -> dict:
    """
    foot_mode:
      - 'auto' (MẶC ĐỊNH): Tự động phân tích chuyển động nền (Optical Flow) + động học 2 chân:
            + Nếu là chạy bộ / đi bộ / đá / nhảy -> giữ nguyên 100% sải chân, bước chạy, nhảy tự do + bám sàn chân trụ
            + Nếu là đứng tại chỗ / né đạn / ngồi xổm / đấm tại chỗ -> khóa chặt 2 chân trên sàn (2-Bone IK) + tách góc máy
            + Nếu camera đứng yên -> giữ nguyên 100% cú xoay người thật của nhân vật
      - 'locked': Ép khóa chặt 2 chân cố định trên sàn
      - 'free_stabilized': Ép chân tự do + khóa hướng thân về trước
      - 'camera_raw': Giữ nguyên 100% góc xoay theo góc máy gốc của video
    """
    t_start = time.time()
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Không tìm thấy tệp video: {video_path}")

    foot_mode = str(foot_mode or "auto").strip().lower()
    if foot_mode not in ("auto", "locked", "free_stabilized", "camera_raw"):
        foot_mode = "auto"

    emit_progress(2, "Đang đọc thông tin khung hình video mẫu...")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Không mở được tệp video: {video_path}")

    raw_fps = float(cap.get(cv2.CAP_PROP_FPS) or 24.0)
    if not math.isfinite(raw_fps) or raw_fps <= 1.0 or raw_fps > 120.0:
        raw_fps = 24.0
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360)

    all_raw_frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        all_raw_frames.append(frame)
    cap.release()

    if len(all_raw_frames) == 0:
        raise RuntimeError("Video mẫu không có khung hình hợp lệ nào.")

    actual_raw_count = len(all_raw_frames)
    duration = max(0.3, min(30.0, round(actual_raw_count / raw_fps, 3)))

    if target_fps <= 0:
        if duration <= 5.0:
            eff_fps = min(raw_fps, 12.0)
        elif duration <= 9.0:
            eff_fps = min(raw_fps, 10.0)
        else:
            eff_fps = min(raw_fps, 8.0)
    else:
        eff_fps = min(raw_fps, max(4.0, target_fps))

    num_samples = int(round(duration * eff_fps)) + 1
    num_samples = max(6, min(max_frames, actual_raw_count, num_samples))

    sample_raw_indices = np.unique(np.round(np.linspace(0, actual_raw_count - 1, num_samples)).astype(int))
    sample_times = [round(float(idx) / raw_fps, 3) for idx in sample_raw_indices]
    if len(sample_times) >= 2:
        sample_times[0] = 0.0
        sample_times[-1] = round(duration, 3)

    scale = min(1.0, 640.0 / max(orig_w, orig_h))
    proc_w = max(160, int(round(orig_w * scale / 2.0) * 2))
    proc_h = max(120, int(round(orig_h * scale / 2.0) * 2))

    frames_rgb = []
    frames_bgr_proc = []
    for raw_idx in sample_raw_indices:
        bgr = all_raw_frames[int(raw_idx)]
        bgr_s = cv2.resize(bgr, (proc_w, proc_h), interpolation=cv2.INTER_AREA) if (proc_w != orig_w or proc_h != orig_h) else bgr
        frames_bgr_proc.append(bgr_s)
        frames_rgb.append(cv2.cvtColor(bgr_s, cv2.COLOR_BGR2RGB))
    del all_raw_frames

    # 2. Nạp mô hình NLF NeurIPS 2024 lên CUDA (hoặc CPU fallback)
    resolved_model = ensure_model(model_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit_progress(12, "Đang chuẩn bị bộ phân tích chuyển động AI...", 0, len(frames_rgb))
    model = torch.jit.load(resolved_model, map_location=device).to(device).eval()

    n_frames = len(frames_rgb)
    anchor_set = set(range(0, n_frames, 3))
    anchor_set.add(0)
    anchor_set.add(n_frames - 1)
    anchor_indices = sorted(anchor_set)

    emit_progress(18, f"Đang nhận diện nhân vật trong {n_frames} khung hình...", 0, n_frames)
    anchor_boxes_raw: dict[int, np.ndarray | None] = {}
    det_batch_size = 8
    prev_tracked_box = None

    with torch.inference_mode():
        for b_start in range(0, len(anchor_indices), det_batch_size):
            b_ids = anchor_indices[b_start : b_start + det_batch_size]
            t_imgs = torch.from_numpy(np.stack([frames_rgb[i] for i in b_ids])).permute(0, 3, 1, 2).to(device)
            t_lin = t_imgs.to(dtype=torch.float16).mul_(1.0 / 255.0).pow_(2.2) if device == "cuda" else (t_imgs.float() / 255.0).pow(2.2)
            det_out = model.detector(t_lin, 0.14, 0.7, 20, None, None, False, False, None)
            for local_i, f_idx in enumerate(b_ids):
                raw_b = det_out[local_i].detach().cpu().numpy() if len(det_out[local_i]) > 0 else np.zeros((0, 5), dtype=np.float32)
                picked = select_primary_box(raw_b, prev_tracked_box, proc_w, proc_h)
                anchor_boxes_raw[f_idx] = picked
                if picked is not None:
                    prev_tracked_box = picked
            del t_imgs, t_lin, det_out
            if device == "cuda":
                torch.cuda.empty_cache()

    valid_anchors = [i for i in anchor_indices if anchor_boxes_raw.get(i) is not None]
    tracked_boxes = np.zeros((n_frames, 4), dtype=np.float32)
    if len(valid_anchors) == 0:
        tracked_boxes[:] = np.array([proc_w * 0.04, proc_h * 0.04, proc_w * 0.92, proc_h * 0.92], dtype=np.float32)
    else:
        for i in range(n_frames):
            if i in anchor_boxes_raw and anchor_boxes_raw[i] is not None:
                tracked_boxes[i] = anchor_boxes_raw[i]
            else:
                left_a = max([a for a in valid_anchors if a < i], default=None)
                right_a = min([a for a in valid_anchors if a > i], default=None)
                if left_a is not None and right_a is not None:
                    alpha = (i - left_a) / float(right_a - left_a)
                    interp = (1.0 - alpha) * anchor_boxes_raw[left_a] + alpha * anchor_boxes_raw[right_a]
                    if right_a - left_a >= 4:
                        bL, bR = anchor_boxes_raw[left_a], anchor_boxes_raw[right_a]
                        ux1 = min(bL[0], bR[0], interp[0])
                        uy1 = min(bL[1], bR[1], interp[1])
                        ux2 = max(bL[0] + bL[2], bR[0] + bR[2], interp[0] + interp[2])
                        uy2 = max(bL[1] + bL[3], bR[1] + bR[3], interp[1] + interp[3])
                        union_b = np.array([ux1, uy1, ux2 - ux1, uy2 - uy1], dtype=np.float32)
                        interp = 0.55 * interp + 0.45 * union_b
                    tracked_boxes[i] = interp
                elif left_a is not None:
                    tracked_boxes[i] = anchor_boxes_raw[left_a]
                else:
                    tracked_boxes[i] = anchor_boxes_raw[right_a]

        if n_frames >= 5:
            for c in range(4):
                tracked_boxes[:, c] = gaussian_filter1d(tracked_boxes[:, c], sigma=1.0, mode="nearest")

    padded_boxes = [clamp_and_pad_box(tracked_boxes[i], proc_w, proc_h, pad_ratio=0.10) for i in range(n_frames)]

    # 3. Trích xuất 24 khớp xoay SMPL 3D + tọa độ 3D
    poses_all = np.zeros((n_frames, 24, 3), dtype=np.float64)
    joints3d_all = np.zeros((n_frames, 24, 3), dtype=np.float64)
    joints2d_all = np.zeros((n_frames, 24, 2), dtype=np.float64)

    est_batch_size = 16
    with torch.inference_mode():
        for b_start in range(0, n_frames, est_batch_size):
            b_end = min(n_frames, b_start + est_batch_size)
            pct = 24 + int((b_start / max(1, n_frames)) * 62)
            emit_progress(
                pct,
                f"Đang phân tích chuyển động từ video ({b_start}/{n_frames} khung hình)...",
                b_start,
                n_frames,
            )
            t_imgs = torch.from_numpy(np.stack(frames_rgb[b_start:b_end])).permute(0, 3, 1, 2).to(device)
            t_boxes = [torch.from_numpy(padded_boxes[k]).unsqueeze(0).to(device) for k in range(b_start, b_end)]
            if device == "cuda":
                with torch.device("cuda"):
                    pred = model.estimate_smpl_batched(t_imgs, t_boxes, num_aug=1, internal_batch_size=est_batch_size)
                torch.cuda.synchronize()
            else:
                pred = model.estimate_smpl_batched(t_imgs, t_boxes, num_aug=1, internal_batch_size=est_batch_size)

            for local_i in range(b_end - b_start):
                g_i = b_start + local_i
                p_list = pred["pose"][local_i]
                j3_list = pred["joints3d"][local_i]
                j2_list = pred["joints2d"][local_i]
                if len(p_list) > 0:
                    poses_all[g_i] = p_list[0].detach().cpu().numpy().reshape(24, 3)
                    joints3d_all[g_i] = j3_list[0].detach().cpu().numpy()[:24]
                    joints2d_all[g_i] = j2_list[0].detach().cpu().numpy()[:24]

            del t_imgs, t_boxes, pred
            if device == "cuda":
                torch.cuda.empty_cache()

    emit_progress(88, "Đang phân tích tư thế, góc máy và chuyển động bàn chân...", n_frames, n_frames)

    # 4. Đo chuyển động hậu cảnh & chiều dài xương giải phẫu
    bg_cam_info = estimate_background_camera_motion(frames_bgr_proc, padded_boxes, fov_deg=55.0)

    j3d_pc_all = np.zeros((n_frames, 24, 3), dtype=np.float64)
    hips_cam_mats = np.zeros((n_frames, 3, 3), dtype=np.float64)
    l_thighs, l_shins, hip_halfs = [], [], []
    for t_i in range(n_frames):
        j_pc = (CV_TO_PC @ joints3d_all[t_i].T).T / 1000.0
        j3d_pc_all[t_i] = j_pc
        hips_cam_mats[t_i] = CV_TO_PC @ R.from_rotvec(poses_all[t_i, 0]).as_matrix()
        l_thighs.append(0.5 * (float(np.linalg.norm(j_pc[4] - j_pc[1])) + float(np.linalg.norm(j_pc[5] - j_pc[2]))))
        l_shins.append(0.5 * (float(np.linalg.norm(j_pc[7] - j_pc[4])) + float(np.linalg.norm(j_pc[8] - j_pc[5]))))
        hip_halfs.append(0.5 * float(np.linalg.norm(j_pc[1] - j_pc[2])))

    l_thigh = float(np.clip(np.median(l_thighs), 0.34, 0.50))
    l_shin = float(np.clip(np.median(l_shins), 0.34, 0.50))
    hip_half_x = float(np.clip(np.median(hip_halfs), 0.08, 0.13))
    ankle_h = 0.085
    rest_hip_h = l_thigh + l_shin + ankle_h

    kin_info = classify_motion_kinematics(j3d_pc_all, hips_cam_mats, sample_times, bg_cam_info)

    if foot_mode == "auto":
        use_foot_lock = kin_info["use_foot_lock"]
        use_orbit_removal = kin_info["use_camera_orbit_removal"]
        resolved_mode = "locked" if use_foot_lock else ("free_stabilized" if use_orbit_removal else "camera_raw")
        motion_label = kin_info["motion_label"]
    elif foot_mode == "locked":
        use_foot_lock = True
        use_orbit_removal = True
        resolved_mode = "locked"
        motion_label = "Khóa 2 chân bám sàn (Thủ công)"
    elif foot_mode == "free_stabilized":
        use_foot_lock = False
        use_orbit_removal = True
        resolved_mode = "free_stabilized"
        motion_label = "Chân tự do + Khóa hướng thân (Thủ công)"
    else:
        use_foot_lock = False
        use_orbit_removal = False
        resolved_mode = "camera_raw"
        motion_label = "Góc máy gốc video (Thủ công)"

    emit_progress(92, "Đang dựng chuỗi Keyframe khớp xương cho nhân vật 3D...", n_frames, n_frames)

    # 5. Căn chỉnh hệ quy chiếu thế giới
    hips_world_mats = np.zeros((n_frames, 3, 3), dtype=np.float64)
    j_world_all = np.zeros((n_frames, 24, 3), dtype=np.float64)

    if use_orbit_removal:
        if use_foot_lock or foot_mode == "free_stabilized":
            raw_yaws = np.array(
                [math.atan2(float(hips_cam_mats[t][:, 0][2]), float(hips_cam_mats[t][:, 0][0])) for t in range(n_frames)],
                dtype=np.float64,
            )
            unwrapped_yaws = np.unwrap(raw_yaws)
            smooth_yaws = gaussian_filter1d(unwrapped_yaws, sigma=1.4, mode="nearest") if n_frames >= 5 else unwrapped_yaws
            for t_i in range(n_frames):
                r_unyaw = R.from_euler("y", smooth_yaws[t_i], degrees=False).as_matrix()
                r_h = r_unyaw @ hips_cam_mats[t_i]
                if use_foot_lock:
                    p_left_w = r_h[:, 0]
                    roll_rad = math.atan2(float(p_left_w[1]), max(1e-5, float(p_left_w[0])))
                    r_unroll = R.from_euler("z", -0.82 * roll_rad, degrees=False).as_matrix()
                    r_align = r_unroll @ r_unyaw
                else:
                    r_align = r_unyaw
                hips_world_mats[t_i] = r_align @ hips_cam_mats[t_i]
                mid_ank = 0.5 * (j3d_pc_all[t_i][7] + j3d_pc_all[t_i][8])
                j_world_all[t_i] = (r_align @ (j3d_pc_all[t_i] - mid_ank).T).T + np.array([0.0, ankle_h, 0.0])
        else:
            cam_yaw = bg_cam_info["cam_yaw_rad"]
            smooth_cam_yaw = gaussian_filter1d(cam_yaw, sigma=1.5, mode="nearest") if n_frames >= 5 else cam_yaw
            for t_i in range(n_frames):
                r_align = R.from_euler("y", -smooth_cam_yaw[t_i], degrees=False).as_matrix()
                hips_world_mats[t_i] = r_align @ hips_cam_mats[t_i]
                mid_ank = 0.5 * (j3d_pc_all[t_i][7] + j3d_pc_all[t_i][8])
                j_world_all[t_i] = (r_align @ (j3d_pc_all[t_i] - mid_ank).T).T + np.array([0.0, ankle_h, 0.0])
    else:
        for t_i in range(n_frames):
            hips_world_mats[t_i] = hips_cam_mats[t_i]
            mid_ank = 0.5 * (j3d_pc_all[t_i][7] + j3d_pc_all[t_i][8])
            j_world_all[t_i] = (j3d_pc_all[t_i] - mid_ank) + np.array([0.0, ankle_h, 0.0])

    # Làm mượt quaternion cho Hips và toàn bộ thân trên
    joint_quats: dict[str, np.ndarray] = {}
    hips_q_raw = np.array([R.from_matrix(hips_world_mats[t]).as_quat() for t in range(n_frames)], dtype=np.float64)
    hips_q_smooth = smooth_quaternions(hips_q_raw, sigma=0.95)
    joint_quats["Hips"] = hips_q_smooth
    hips_mats_smooth = np.array([R.from_quat(hips_q_smooth[t]).as_matrix() for t in range(n_frames)], dtype=np.float64)

    upper_indices = [(j_idx, nm) for (j_idx, nm) in SMPL_JOINT_NAMES if j_idx not in (0, 1, 2, 4, 5, 7, 8)]
    for j_idx, bone_name in upper_indices:
        raw_q = np.array([R.from_rotvec(poses_all[t, j_idx]).as_quat() for t in range(n_frames)], dtype=np.float64)
        sig = 0.68 if j_idx in (16, 17, 18, 19, 20, 21) else 0.85
        joint_quats[bone_name] = smooth_quaternions(raw_q, sigma=sig)

    # 6. Xử lý phần chân & độ cao Hips theo đúng bản chất vật lý của chuyển động
    hips_pos_delta = np.zeros((n_frames, 3), dtype=np.float64)
    max_foot_drift_mm = 0.0

    if use_foot_lock:
        stance_dx = float(np.median(np.abs(j_world_all[:, 7, 0] - j_world_all[:, 8, 0])))
        stance_half_x = float(np.clip(stance_dx * 0.5, 0.14, 0.28))
        stagger_z = float(np.clip(np.median(j_world_all[:, 7, 2] - j_world_all[:, 8, 2]) * 0.5, -0.10, 0.10))

        l_ankle_fixed = np.array([+stance_half_x, ankle_h, +stagger_z], dtype=np.float64)
        r_ankle_fixed = np.array([-stance_half_x, ankle_h, -stagger_z], dtype=np.float64)

        raw_hips_p = j_world_all[:, 0, :].copy()
        if n_frames >= 5:
            for c in range(3):
                raw_hips_p[:, c] = gaussian_filter1d(raw_hips_p[:, c], sigma=1.4, mode="nearest")

        max_leg_reach = (l_thigh + l_shin) * 0.965
        mid_floor = 0.5 * (l_ankle_fixed + r_ankle_fixed)

        l_upleg_q = np.zeros((n_frames, 4), dtype=np.float64)
        l_leg_q = np.zeros((n_frames, 4), dtype=np.float64)
        l_foot_q = np.zeros((n_frames, 4), dtype=np.float64)
        r_upleg_q = np.zeros((n_frames, 4), dtype=np.float64)
        r_leg_q = np.zeros((n_frames, 4), dtype=np.float64)
        r_foot_q = np.zeros((n_frames, 4), dtype=np.float64)

        for t_i in range(n_frames):
            r_h = hips_mats_smooth[t_i]
            p_h = raw_hips_p[t_i].copy()
            p_h[0] = float(np.clip(p_h[0], -0.25, 0.25))
            p_h[1] = float(np.clip(p_h[1], 0.34, rest_hip_h - 0.02))
            p_h[2] = float(np.clip(p_h[2], -0.58, 0.35))

            for _ in range(4):
                p_lh = p_h + r_h @ np.array([+hip_half_x, -0.02, 0.0])
                p_rh = p_h + r_h @ np.array([-hip_half_x, -0.02, 0.0])
                d_max = max(float(np.linalg.norm(p_lh - l_ankle_fixed)), float(np.linalg.norm(p_rh - r_ankle_fixed)))
                if d_max <= max_leg_reach:
                    break
                shrink = (max_leg_reach - 0.005) / max(1e-6, d_max)
                p_h = mid_floor + (p_h - mid_floor) * shrink

            hips_pos_delta[t_i] = np.array([p_h[0], p_h[1] - rest_hip_h, p_h[2]], dtype=np.float64)

            p_lh = p_h + r_h @ np.array([+hip_half_x, -0.02, 0.0])
            p_rh = p_h + r_h @ np.array([-hip_half_x, -0.02, 0.0])

            lk_raw = j_world_all[t_i, 4] - 0.5 * (j_world_all[t_i, 1] + j_world_all[t_i, 7])
            rk_raw = j_world_all[t_i, 5] - 0.5 * (j_world_all[t_i, 2] + j_world_all[t_i, 8])
            l_pole = _normalize(np.array([0.28, 0.12, 1.0]) + 0.35 * _normalize(lk_raw, np.array([0.2, 0.0, 1.0])), np.array([0.25, 0.0, 1.0]))
            r_pole = _normalize(np.array([-0.28, 0.12, 1.0]) + 0.35 * _normalize(rk_raw, np.array([-0.2, 0.0, 1.0])), np.array([-0.25, 0.0, 1.0]))
            if l_pole[2] < 0.25:
                l_pole = _normalize(np.array([0.25, 0.10, 0.96]), np.array([0.25, 0.0, 1.0]))
            if r_pole[2] < 0.25:
                r_pole = _normalize(np.array([-0.25, 0.10, 0.96]), np.array([-0.25, 0.0, 1.0]))

            r_lt_w, r_ls_w, r_lf_w, _ = solve_two_bone_leg_ik(p_lh, l_ankle_fixed, l_thigh, l_shin, l_pole, +10.0)
            r_rt_w, r_rs_w, r_rf_w, _ = solve_two_bone_leg_ik(p_rh, r_ankle_fixed, l_thigh, l_shin, r_pole, -10.0)

            fk_la = p_lh + r_lt_w @ np.array([0.0, -l_thigh, 0.0]) + r_ls_w @ np.array([0.0, -l_shin, 0.0])
            fk_ra = p_rh + r_rt_w @ np.array([0.0, -l_thigh, 0.0]) + r_rs_w @ np.array([0.0, -l_shin, 0.0])
            drift = max(float(np.linalg.norm(fk_la - l_ankle_fixed)), float(np.linalg.norm(fk_ra - r_ankle_fixed))) * 1000.0
            if drift > max_foot_drift_mm:
                max_foot_drift_mm = drift

            l_upleg_q[t_i] = R.from_matrix(r_h.T @ r_lt_w).as_quat()
            l_leg_q[t_i] = R.from_matrix(r_lt_w.T @ r_ls_w).as_quat()
            l_foot_q[t_i] = R.from_matrix(r_ls_w.T @ r_lf_w).as_quat()

            r_upleg_q[t_i] = R.from_matrix(r_h.T @ r_rt_w).as_quat()
            r_leg_q[t_i] = R.from_matrix(r_rt_w.T @ r_rs_w).as_quat()
            r_foot_q[t_i] = R.from_matrix(r_rs_w.T @ r_rf_w).as_quat()

        joint_quats["LeftUpLeg"] = smooth_quaternions(l_upleg_q, sigma=0.0)
        joint_quats["LeftLeg"] = smooth_quaternions(l_leg_q, sigma=0.0)
        joint_quats["LeftFoot"] = smooth_quaternions(l_foot_q, sigma=0.0)
        joint_quats["RightUpLeg"] = smooth_quaternions(r_upleg_q, sigma=0.0)
        joint_quats["RightLeg"] = smooth_quaternions(r_leg_q, sigma=0.0)
        joint_quats["RightFoot"] = smooth_quaternions(r_foot_q, sigma=0.0)
    else:
        for j_idx, bone_name in [(1, "LeftUpLeg"), (4, "LeftLeg"), (7, "LeftFoot"), (2, "RightUpLeg"), (5, "RightLeg"), (8, "RightFoot")]:
            raw_q = np.array([R.from_rotvec(poses_all[t, j_idx]).as_quat() for t in range(n_frames)], dtype=np.float64)
            joint_quats[bone_name] = smooth_quaternions(raw_q, sigma=0.65)

        hips_above_lowest_foot = np.zeros(n_frames, dtype=np.float64)
        lowest_foot_cam_y = np.zeros(n_frames, dtype=np.float64)
        for t_i in range(n_frames):
            jw = j_world_all[t_i]
            lowest_foot_y = float(min(jw[7, 1], jw[8, 1], jw[10, 1], jw[11, 1]))
            hips_above_lowest_foot[t_i] = float(jw[0, 1]) - lowest_foot_y
            lowest_foot_cam_y[t_i] = float(min(j3d_pc_all[t_i][7, 1], j3d_pc_all[t_i][8, 1], j3d_pc_all[t_i][10, 1], j3d_pc_all[t_i][11, 1]))

        flight_lift = np.zeros(n_frames, dtype=np.float64)
        if not bg_cam_info["is_camera_moving"] and n_frames >= 5:
            ground_y_ref = float(np.percentile(lowest_foot_cam_y, 15))
            raw_lift = np.maximum(0.0, lowest_foot_cam_y - ground_y_ref - 0.06)
            flight_lift = np.clip(raw_lift, 0.0, 0.85)

        pos_y = (hips_above_lowest_foot - rest_hip_h) + flight_lift
        if n_frames >= 5:
            pos_y = gaussian_filter1d(pos_y, sigma=0.85, mode="nearest")
        pos_y = np.clip(pos_y, -0.78, 0.95)
        for t_i in range(n_frames):
            hips_pos_delta[t_i] = np.array([0.0, pos_y[t_i], 0.0], dtype=np.float64)

    # 7. Xuất mảng keyframes chuẩn SontinhSceneService (poseSpace = 'tpose', Euler extrinsic 'xyz')
    keyframes = []
    for _, bone_name in SMPL_JOINT_NAMES:
        q_seq = joint_quats[bone_name]
        for t_i in range(n_frames):
            ex, ey, ez = R.from_quat(q_seq[t_i]).as_euler("xyz", degrees=True)
            kf = {
                "time": sample_times[t_i],
                "boneName": bone_name,
                "rot": {
                    "x": round(float(ex), 2),
                    "y": round(float(ey), 2),
                    "z": round(float(ez), 2),
                },
            }
            if bone_name == "Hips":
                kf["pos"] = {
                    "x": round(float(hips_pos_delta[t_i, 0]), 4),
                    "y": round(float(hips_pos_delta[t_i, 1]), 4),
                    "z": round(float(hips_pos_delta[t_i, 2]), 4),
                }
            keyframes.append(kf)

    if debug_vis_path:
        vis_indices = [int(round(i * (n_frames - 1) / 7)) for i in range(min(8, n_frames))]
        tiles = []
        for idx in vis_indices:
            vis = frames_bgr_proc[idx].copy()
            j2d = joints2d_all[idx]
            for a, c in SMPL_EDGES:
                p1 = (int(round(j2d[a, 0])), int(round(j2d[a, 1])))
                p2 = (int(round(j2d[c, 0])), int(round(j2d[c, 1])))
                col = (0, 255, 120) if a in (1, 4, 7, 13, 16, 18, 20) else ((255, 180, 0) if a in (2, 5, 8, 14, 17, 19, 21) else (0, 220, 255))
                cv2.line(vis, p1, p2, col, 2, cv2.LINE_AA)
            cv2.putText(
                vis,
                f"t={sample_times[idx]:.2f}s [{resolved_mode}]",
                (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (0, 255, 255),
                2,
            )
            tiles.append(cv2.resize(vis, (400, 225)))
        if len(tiles) >= 8:
            grid = np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:8])])
            cv2.imwrite(debug_vis_path, grid)

    elapsed = round(time.time() - t_start, 2)
    result = {
        "success": True,
        "engine": "nlf-smpl-3d-adaptive",
        "device": device,
        "duration": round(float(duration), 3),
        "rawFps": round(float(raw_fps), 3),
        "sampledFps": round(float(n_frames / max(0.1, duration)), 2),
        "frameCount": int(n_frames),
        "detectedAnchorFrames": len(valid_anchors),
        "totalAnchorFrames": len(anchor_indices),
        "requestedFootMode": foot_mode,
        "footMode": resolved_mode,
        "footLock": bool(use_foot_lock),
        "detectedMotionType": kin_info["motion_type"],
        "detectedMotionLabel": motion_label,
        "cameraPanDeg": bg_cam_info["total_pan_deg"],
        "cameraMoving": bg_cam_info["is_camera_moving"],
        "strideRangeM": kin_info["stride_range_m"],
        "footLiftP95M": kin_info["foot_lift_p95_m"],
        "sourceLegLength": round(float(l_thigh + l_shin), 4),
        "maxFootDriftMm": round(float(max_foot_drift_mm), 3),
        "poseSpace": "tpose",
        "boneCount": len(SMPL_JOINT_NAMES),
        "keyframeCount": len(keyframes),
        "elapsedSec": elapsed,
        "keyframes": keyframes,
    }

    Path(out_json_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    emit_progress(100, f"Hoàn tất tạo chuyển động từ video ({n_frames} khung hình)!", n_frames, n_frames)
    return result


def main():
    parser = argparse.ArgumentParser(description="AI.Type Adaptive 3D Video Motion Capture (NLF SMPL + Optical Flow + Auto Foot IK)")
    parser.add_argument("--video", required=True, help="Đường dẫn tệp video mẫu")
    parser.add_argument("--out", required=True, help="Đường dẫn tệp JSON đầu ra")
    parser.add_argument("--model", default="", help="Đường dẫn tệp TorchScript NLF")
    parser.add_argument("--fps", type=float, default=0.0, help="Tần suất lấy mẫu khung hình (0 = tự động)")
    parser.add_argument("--max-frames", type=int, default=96, help="Số khung hình lấy mẫu tối đa")
    parser.add_argument("--foot-mode", default="", help="auto | locked | free_stabilized | camera_raw")
    parser.add_argument("--stabilize-yaw", type=int, default=0, help="Tương thích ngược")
    parser.add_argument("--debug-vis", default="", help="Đường dẫn ảnh kiểm chứng tùy chọn")
    args = parser.parse_args()

    default_model = str(Path(__file__).resolve().parent.parent / "mocap-env" / "models" / "nlf_l_multi_0.3.2.torchscript")
    model_path = args.model.strip() if args.model else default_model
    foot_mode = args.foot_mode.strip() if args.foot_mode else ("free_stabilized" if args.stabilize_yaw else "auto")

    try:
        res = run_video_mocap(
            video_path=args.video,
            out_json_path=args.out,
            model_path=model_path,
            target_fps=args.fps,
            max_frames=args.max_frames,
            foot_mode=foot_mode,
            debug_vis_path=args.debug_vis,
        )
        print(
            json.dumps(
                {
                    "type": "done",
                    "duration": res["duration"],
                    "frameCount": res["frameCount"],
                    "keyframeCount": res["keyframeCount"],
                    "footMode": res["footMode"],
                    "detectedMotionType": res["detectedMotionType"],
                    "detectedMotionLabel": res["detectedMotionLabel"],
                    "cameraPanDeg": res["cameraPanDeg"],
                    "strideRangeM": res["strideRangeM"],
                    "maxFootDriftMm": res["maxFootDriftMm"],
                    "elapsedSec": res["elapsedSec"],
                    "device": res["device"],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    except Exception as exc:
        print(json.dumps({"type": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
