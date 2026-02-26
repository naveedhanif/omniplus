import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AttributeDefinition } from '../../../../core/services/mock-supabase.service';

@Component({
    selector: 'app-product-attributes-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    template: `
    <div class="space-y-4 animate-in fade-in duration-300" *ngIf="attributes.length > 0">
      <div class="flex items-center gap-2 text-slate-400 mb-4">
        <span class="material-symbols-rounded text-sm text-[var(--primary-color)]">tune</span>
        <h3 class="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">Technical Specifications</h3>
      </div>
      
      <form [formGroup]="form">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-700 rounded-xl">
          <div *ngFor="let attr of attributes" class="space-y-1">
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400">
              {{ attr.name }} <span *ngIf="attr.is_required" class="text-red-500">*</span>
            </label>
            
            <ng-container [ngSwitch]="attr.data_type">
              <!-- BOOLEAN -->
              <div *ngSwitchCase="'BOOLEAN'" class="flex items-center mt-2">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [formControlName]="attr.json_key" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--primary-color)]"></div>
                  <span class="ml-3 text-xs font-bold text-slate-600 dark:text-slate-400">{{ form.get(attr.json_key)?.value ? 'Yes' : 'No' }}</span>
                </label>
              </div>

              <!-- NUMBER -->
              <input *ngSwitchCase="'NUMBER'" [formControlName]="attr.json_key" type="number" step="any"
                class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm font-medium focus:border-[var(--primary-color)] outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                [placeholder]="'Enter ' + attr.name.toLowerCase()">

              <!-- STRING (Fallback) -->
              <input *ngSwitchDefault [formControlName]="attr.json_key" type="text"
                class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm font-medium focus:border-[var(--primary-color)] outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                [placeholder]="'Enter ' + attr.name.toLowerCase()">
            </ng-container>
          </div>
        </div>
      </form>
    </div>
    
    <div *ngIf="attributes.length === 0 && selectedCategoryId" class="text-xs text-slate-400 italic p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      No specific technical attributes defined for this category.
    </div>
  `,
    styles: []
})
export class ProductAttributesFormComponent implements OnInit, OnChanges {
    @Input() attributes: AttributeDefinition[] = [];
    @Input() initialValues: Record<string, any> = {};
    @Input() selectedCategoryId: string | null = null;
    @Output() valueChange = new EventEmitter<Record<string, any>>();
    @Output() validityChange = new EventEmitter<boolean>();

    private fb = inject(FormBuilder);
    form: FormGroup = this.fb.group({});

    ngOnInit() {
        this.buildForm();
        this.form.valueChanges.subscribe(val => {
            this.valueChange.emit(val);
            this.validityChange.emit(this.form.valid);
        });
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['attributes'] && !changes['attributes'].isFirstChange()) {
            this.buildForm();
        }
    }

    private buildForm() {
        const group: any = {};
        for (const attr of this.attributes) {
            let initialValue = this.initialValues[attr.json_key] !== undefined
                ? this.initialValues[attr.json_key]
                : (attr.data_type === 'BOOLEAN' ? false : null);

            const validators = attr.is_required ? [Validators.required] : [];
            group[attr.json_key] = [initialValue, validators];
        }
        this.form = this.fb.group(group);

        // Emit initial status
        setTimeout(() => {
            this.valueChange.emit(this.form.value);
            this.validityChange.emit(this.form.valid);
        });
    }

    public getValues(): Record<string, any> {
        return this.form.value;
    }
}
