import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { TaskProgressService, TaskProgressState } from './task-progress.service';

@Component({
    selector: 'task-progress',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    encapsulation: ViewEncapsulation.None,
    template: `
        <div class="min-w-[350px] max-w-[500px] bg-white rounded shadow-xl overflow-hidden pointer-events-auto">
            <!-- Header bar with loading gradient -->
            <div *ngIf="!state.isError && !state.isDone" class="h-1 w-full bg-blue-100 overflow-hidden relative">
                <div class="h-full bg-blue-500 absolute w-1/3 progress-bar"></div>
            </div>
            <div *ngIf="state.isError" class="h-1 w-full bg-red-500"></div>
            <div *ngIf="state.isDone && !state.isError" class="h-1 w-full bg-green-500"></div>
            
            <div class="p-4 flex items-start gap-3">
                <!-- Icon -->
                <div class="flex-shrink-0 mt-0.5">
                    <mat-icon *ngIf="state.isError" class="text-red-500 icon-size-6">error</mat-icon>
                    <mat-icon *ngIf="state.isDone && !state.isError" class="text-green-500 icon-size-6">check_circle</mat-icon>
                    <mat-icon *ngIf="!state.isError && !state.isDone" class="text-blue-500 icon-size-6 animate-spin">settings</mat-icon>
                </div>
                
                <!-- Content -->
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <p class="text-sm font-bold text-gray-800 truncate">{{ state.title }}</p>
                    <p class="text-xs text-gray-500 mt-1 break-words whitespace-pre-wrap">{{ state.message }}</p>
                </div>
                
                <!-- Close Button -->
                <button (click)="hide()" class="flex-shrink-0 text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100 transition-colors focus:outline-none flex items-center justify-center">
                    <mat-icon class="icon-size-4">close</mat-icon>
                </button>
            </div>
        </div>
    `,
    styles: [`
        .progress-bar {
            animation: progress 1.5s ease-in-out infinite;
        }
        @keyframes progress {
            0% { left: -33%; }
            100% { left: 100%; }
        }
        /* Ghi đè nền đen của MatSnackBar */
        .mdc-snackbar__surface {
            background-color: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
        }
        .mat-mdc-snack-bar-container .mdc-snackbar__label {
            padding: 0 !important;
        }
    `]
})
export class TaskProgressComponent implements OnInit, OnDestroy {
    state: TaskProgressState = { title: '', message: '', isError: false, isDone: false };
    private destroy$ = new Subject<void>();

    constructor(private progressService: TaskProgressService) { }

    ngOnInit() {
        this.progressService.state$
            .pipe(takeUntil(this.destroy$))
            .subscribe(s => this.state = s);
    }

    hide() {
        this.progressService.hide(true);
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
