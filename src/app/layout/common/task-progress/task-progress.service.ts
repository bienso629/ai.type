import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { TaskProgressComponent } from './task-progress.component';

export interface TaskProgressState {
    title: string;
    message: string;
    isError: boolean;
    isDone: boolean;
}

@Injectable({ providedIn: 'root' })
export class TaskProgressService {
    private stateSubject = new BehaviorSubject<TaskProgressState>({
        title: 'Đang xử lý...',
        message: '',
        isError: false,
        isDone: false
    });

    state$ = this.stateSubject.asObservable();
    private snackBarRef: MatSnackBarRef<any> | null = null;

    constructor(private snackBar: MatSnackBar) {}

    show(title: string, message: string = '') {
        this.stateSubject.next({ title, message, isError: false, isDone: false });
        if (!this.snackBarRef) {
            this.snackBarRef = this.snackBar.openFromComponent(TaskProgressComponent, {
                horizontalPosition: 'center',
                verticalPosition: 'top',
                panelClass: ['p-0', 'bg-transparent', 'shadow-none', 'mt-4']
            });
        }
    }

    updateMessage(message: string) {
        const state = this.stateSubject.value;
        if (!state.isDone && this.snackBarRef) {
            this.stateSubject.next({ ...state, message });
        }
    }

    error(message: string) {
        const state = this.stateSubject.value;
        this.stateSubject.next({ ...state, message, isError: true, isDone: true });
        this.autoHide();
    }

    done(message: string = 'Hoàn tất!') {
        const state = this.stateSubject.value;
        this.stateSubject.next({ ...state, message, isDone: true, isError: false });
        this.autoHide();
    }

    private autoHide() {
        setTimeout(() => this.hide(), 4000);
    }

    private cancelSubject = new Subject<void>();
    cancel$ = this.cancelSubject.asObservable();

    hide(isCancel: boolean = false) {
        if (this.snackBarRef) {
            this.snackBarRef.dismiss();
            this.snackBarRef = null;
        }
        
        const state = this.stateSubject.value;
        if (isCancel && !state.isDone && !state.isError) {
            this.cancelSubject.next();
        }
    }
}
