import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SharedService {
	private eventSource = new Subject<any>(); // hoặc Subject<any> nếu muốn truyền dữ liệu
	event$ = this.eventSource.asObservable(); // public observable

	trigger(data: any, total: number, categories: any) {
		this.eventSource.next({ form: data, total: total, categories: categories }); // phát sự kiện
	}
}