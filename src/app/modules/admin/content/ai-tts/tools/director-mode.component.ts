import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-director-mode',
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
    templateUrl: './director-mode.component.html',
    styles: [`
        .light-theme {
            background-color: #ffffff;
            color: #111827;
        }
        .section-card {
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
            border: 1px solid #f3f4f6;
        }
        .option-img {
            width: 100%;
            height: 45px;
            object-fit: cover;
            border-radius: 8px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
            background-color: #f9fafb;
        }
        .option-item.selected .option-img {
            border-color: #4f46e5;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
        }
        .option-item:hover .option-img {
            opacity: 0.8;
            background-color: #f3f4f6;
        }
        .toggle-btn {
            background-color: #ffffff;
            color: #6b7280;
            border-radius: 6px;
            padding: 8px 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
            flex: 1;
            border: 1px solid transparent;
        }
        .toggle-btn.selected {
            background-color: #ffffff;
            color: #4f46e5;
            font-weight: 600;
            border-color: #4f46e5;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
    `]
})
export class DirectorModeComponent implements OnInit {
    
    selections: any = {
        timeOfDay: '',
        lighting: '',
        filmStockColor: 'Full color',
        filmStockType: '',
        focusDepth: '',
        composition: '',
        shotSize: '',
        lenses: '',
        movementType: '',
        movementSpeed: 'Standard movement',
        movementEasing: 'Standard easing'
    };

    categories = {
        timeOfDay: ['Golden hour', 'Midday', 'Twilight', 'Neon'],
        lighting: ['Front lit', 'Side lit', 'Back lit', 'Top lit'],
        filmStockType: ['VHS', '16mm', '35mm', 'Digital'],
        focusDepth: ['Deep focus', 'Cinematic Bokeh', 'Selective focus'],
        composition: ['Rule of thirds', 'Center weighted', 'Negative space', 'Headroom'],
        shotSize: ['Extreme close-up', 'Close-up', 'Medium', 'Wide', 'Extreme wide'],
        lenses: ['Wide angle', 'Standard', 'Telephoto', 'Macro'],
        movementType: ['Static', 'Tilt', 'Dolly', 'Tracking', 'Orbit']
    };

    // Dummy images for UI display. You can replace these with local assets later.
    getPlaceholderUrl(label: string) {
        let textParts = label.split(' ');
        let initials = textParts.length > 1 ? textParts[0][0] + textParts[1][0] : label.substring(0, 2);
        initials = initials.toUpperCase();
        return `https://ui-avatars.com/api/?name=${initials}&background=e5e7eb&color=4b5563&size=128&font-size=0.4`;
    }

    constructor(
        public dialogRef: MatDialogRef<DirectorModeComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        // Init with existing prompt if any
        if (data && data.prompt) {
            // Very simple parsing logic can go here if needed, but usually it's just building it
        }
    }

    ngOnInit(): void {}

    select(category: string, value: string) {
        if (this.selections[category] === value) {
            this.selections[category] = ''; // toggle off
        } else {
            this.selections[category] = value;
        }
    }

    apply() {
        let parts = [];
        
        if (this.selections.timeOfDay) parts.push(this.selections.timeOfDay);
        if (this.selections.lighting) parts.push(this.selections.lighting);
        
        if (this.selections.filmStockType) {
            parts.push(`${this.selections.filmStockColor} ${this.selections.filmStockType}`);
        }
        
        if (this.selections.focusDepth) parts.push(this.selections.focusDepth);
        if (this.selections.composition) parts.push(this.selections.composition);
        if (this.selections.shotSize) parts.push(this.selections.shotSize);
        if (this.selections.lenses) parts.push(this.selections.lenses);
        
        if (this.selections.movementType) {
            if (this.selections.movementType !== 'Static') {
                parts.push(`${this.selections.movementSpeed} ${this.selections.movementType} with ${this.selections.movementEasing}`);
            } else {
                parts.push('Static camera');
            }
        }

        const finalPrompt = parts.join(', ');
        this.dialogRef.close(finalPrompt);
    }
}
