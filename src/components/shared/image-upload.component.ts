import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-image-upload',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div 
      class="relative group w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-center items-center justify-center overflow-hidden transition-all hover:border-[var(--primary-color)]"
      [class.border-[var(--primary-color)]]="isDragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      @if (previewUrl()) {
        <img [src]="previewUrl()" class="w-full h-full object-cover transition-transform group-hover:scale-110">
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button (click)="fileInput.click()" class="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button (click)="removeImage()" class="p-2 bg-red-500/20 hover:bg-red-500/40 backdrop-blur-md rounded-full text-red-200 transition-all">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      } @else {
        <div class="text-center p-6 cursor-pointer" (click)="fileInput.click()">
          <div class="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-400 group-hover:text-[var(--primary-color)] transition-colors">
            <span class="material-symbols-rounded text-3xl">add_photo_alternate</span>
          </div>
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Upload Photo</p>
          <p class="text-[10px] opacity-50">Drag and drop or click to browse</p>
        </div>
      }

      <input 
        #fileInput 
        type="file" 
        class="hidden" 
        accept="image/*" 
        (change)="onFileSelected($event)"
      >
      
      @if (isUploading()) {
        <div class="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
          <div class="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-[var(--primary-color)] rounded-full animate-spin mb-4"></div>
          <p class="text-xs font-bold text-[var(--primary-color)] animate-pulse">UPLOADING...</p>
        </div>
      }
    </div>
  `
})
export class ImageUploadComponent {
    @Input() set initialUrl(url: string | undefined | null) {
        if (url) this.previewUrl.set(url);
        else this.previewUrl.set(null);
    }
    @Output() imageSelected = new EventEmitter<File | null>();

    previewUrl = signal<string | null>(null);
    isDragging = signal(false);
    isUploading = signal(false);

    onDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging.set(true);
    }

    onDragLeave(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging.set(false);
    }

    onDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging.set(false);

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    onFileSelected(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.processFile(input.files[0]);
        }
    }

    processFile(file: File) {
        if (!file.type.startsWith('image/')) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            this.previewUrl.set(reader.result as string);
            this.imageSelected.emit(file);
        };
        reader.readAsDataURL(file);
    }

    removeImage() {
        this.previewUrl.set(null);
        this.imageSelected.emit(null);
    }
}
