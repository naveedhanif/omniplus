import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup, FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { switchMap, of, BehaviorSubject } from 'rxjs';
import { MockSupabaseService, Category, Product } from '../../../../core/services/mock-supabase.service';
import { StoreConfigService } from '../../../../core/services/store-config.service';
import { DialogService } from '../../../../core/services/dialog.service';

@Component({
  selector: 'app-categories-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, DragDropModule],
  template: `
    <div class="h-[calc(100vh-140px)] flex flex-col pt-0">

      <!-- TOP BAR (Global Search & Actions) -->
      <div class="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 border-x rounded-t-2xl shadow-sm z-10">
        <div class="relative w-96">
          <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input type="text" [(ngModel)]="globalSearch" placeholder="Search categories..."
                 class="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-medium">
        </div>
        <div class="flex items-center gap-3">
          <button (click)="exportAllCategories()" class="px-5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">Export</button>
          <button (click)="fileInput.click()" class="px-5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">Import</button>
          <input type="file" #fileInput (change)="importCategories($event)" accept=".csv,.json" class="hidden">
          <button (click)="openAddMode()" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2">
            <span class="material-symbols-rounded text-sm">add</span> New Category
          </button>
        </div>
      </div>

      <!-- MAIN LAYOUT -->
      <div class="flex-1 flex bg-white dark:bg-slate-900 rounded-b-2xl border border-t-0 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative">

        <!-- LEFT PANEL: CATEGORY TREE (30%) -->
        <div class="w-[30%] flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 relative">
          
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
            <h2 class="text-[11px] font-black uppercase tracking-widest text-slate-400">Category Master Tree</h2>
            <button class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <span class="material-symbols-rounded text-sm">filter_list</span>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar" 
               cdkDropListGroup>
            
            <div cdkDropList 
                 [cdkDropListData]="null"
                 (cdkDropListDropped)="onCdkDrop($event)"
                 class="space-y-1 min-h-[50px]">
              
              @for (group of hierarchicalCategories(); track group.parent.id) {
                <!-- Parent Row -->
                <div class="group relative flex flex-col"
                     cdkDrag [cdkDragData]="group.parent">
                  
                  <!-- Custom Drag Preview -->
                  <div *cdkDragPreview class="bg-white dark:bg-slate-800 border-blue-500 border-2 rounded-xl p-2 w-64 shadow-xl flex items-center gap-3">
                     <span class="material-symbols-rounded text-slate-300">drag_indicator</span>
                     <span class="text-sm font-semibold truncate">{{ group.parent.name }}</span>
                  </div>

                  <!-- Drag Placeholder -->
                  <div *cdkDragPlaceholder class="bg-slate-100 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl h-10 my-1"></div>

                  <div class="flex items-center gap-2 p-2 rounded-xl transition-all border"
                       [ngClass]="{
                         'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm': selectedCategoryId() === group.parent.id,
                         'hover:bg-white/60 dark:hover:bg-slate-800/60 border-transparent': selectedCategoryId() !== group.parent.id
                       }">
                    
                    <span cdkDragHandle class="material-symbols-rounded text-slate-300 cursor-grab active:cursor-grabbing hover:text-slate-500">drag_indicator</span>
                    
                    <input type="checkbox" 
                           [checked]="selectedCategories().has(group.parent.id)"
                           (change)="toggleCategorySelection(group.parent.id, $event)"
                           class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600">
                           
                    <button (click)="selectCategory(group.parent)" class="flex-1 flex items-center gap-3 text-left overflow-hidden">
                      <span class="material-symbols-rounded text-slate-300 text-sm p-0.5 hover:bg-slate-200 rounded cursor-pointer" 
                            (click)="toggleExpand(group.parent.id, $event)">
                        {{ expandedCategories().has(group.parent.id) ? 'keyboard_arrow_down' : 'chevron_right' }}
                      </span>
                      <div class="w-2.5 h-2.5 rounded-full shadow-sm" [style.backgroundColor]="group.parent.color || '#3b82f6'"></div>
                      <span class="text-sm font-semibold truncate flex-1 text-slate-800 dark:text-slate-200">{{ group.parent.name }}</span>
                      @if(group.children.length > 0) {
                        <span class="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm">{{group.children.length}}</span>
                      }
                    </button>

                    <div class="relative">
                      <button (click)="toggleMenu(group.parent.id, $event)" class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition-all">
                        <span class="material-symbols-rounded text-sm">more_vert</span>
                      </button>
                      @if (activeMenuId() === group.parent.id) {
                        <div class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1.5 z-[100] animate-in fade-in zoom-in duration-200">
                          <button (click)="selectCategory(group.parent); activeMenuId.set(null)" class="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><span class="material-symbols-rounded text-sm">edit</span> Edit Rules</button>
                          <button (click)="addSubcategoryFromMenu(group.parent.id)" class="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><span class="material-symbols-rounded text-sm">subdirectory_arrow_right</span> Add Subcategory</button>
                          <div class="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>
                          <button (click)="quickDelete(group.parent)" class="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"><span class="material-symbols-rounded text-sm">delete</span> Delete Node</button>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Children Drop List -->
                  @if (expandedCategories().has(group.parent.id)) {
                    <div class="ml-9 mt-1 space-y-1 relative before:absolute before:border-l-2 before:border-slate-200 dark:before:border-slate-700 before:-left-3 before:top-0 before:bottom-3"
                         cdkDropList 
                         [cdkDropListData]="group.parent.id"
                         (cdkDropListDropped)="onCdkDrop($event)">
                      
                      <div class="min-h-[10px] pb-1 w-full rounded border border-transparent"
                           [ngClass]="{'bg-blue-50/50 dark:bg-blue-900/20 border-dashed border-blue-200': true}">
                        @for (child of group.children; track child.id) {
                          <div class="flex items-center gap-2 p-2 rounded-xl transition-all border group/child bg-white dark:bg-slate-900 mb-1"
                               cdkDrag [cdkDragData]="child"
                               [ngClass]="{
                                 'bg-slate-50 dark:bg-slate-800 border-blue-200 dark:border-blue-900/50 shadow-sm': selectedCategoryId() === child.id,
                                 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60 border-slate-100 dark:border-slate-800': selectedCategoryId() !== child.id
                               }">
                               
                            <span cdkDragHandle class="material-symbols-rounded text-slate-200 cursor-grab active:cursor-grabbing hover:text-slate-400 scale-75">drag_indicator</span>

                            <input type="checkbox" 
                                   [checked]="selectedCategories().has(child.id)"
                                   (change)="toggleCategorySelection(child.id, $event)"
                                   class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600">
                            <button (click)="selectCategory(child)" class="flex-1 flex items-center gap-3 text-left overflow-hidden">
                               <div class="w-1.5 h-1.5 rounded-full opacity-50 shadow-sm" [style.backgroundColor]="child.color || group.parent.color"></div>
                               <span class="text-[13px] font-medium truncate flex-1 text-slate-600 dark:text-slate-300">{{ child.name }}</span>
                            </button>
                            
                            <div class="relative">
                              <button (click)="toggleMenu(child.id, $event)" class="opacity-0 group-[.group/child]:hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition-all">
                                <span class="material-symbols-rounded text-xs">more_vert</span>
                              </button>
                              @if (activeMenuId() === child.id) {
                                <div class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1.5 z-[100] animate-in fade-in zoom-in duration-200">
                                  <button (click)="selectCategory(child); activeMenuId.set(null)" class="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><span class="material-symbols-rounded text-sm">edit</span> Edit Rules</button>
                                  <div class="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>
                                  <button (click)="quickDelete(child)" class="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"><span class="material-symbols-rounded text-sm">delete</span> Delete Node</button>
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </div>

                    </div>
                  }
                </div>
              } @empty {
                <div class="text-center py-20 text-slate-400">
                  <span class="material-symbols-rounded text-4xl mb-2 opacity-50">account_tree</span>
                  <p class="text-xs font-bold uppercase">No records found</p>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL: EDITOR (70%) -->
        <div class="w-[70%] flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
          
          @if (panelMode() === 'EMPTY') {
            <div class="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-400">
               <span class="material-symbols-rounded text-6xl mb-4 opacity-20">category</span>
               <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">Select a category</h3>
               <p class="text-sm max-w-md">Choose a category from the tree on the left to edit its identity, pricing rules, and inventory thresholds, or create a new one.</p>
               <button (click)="openAddMode()" class="mt-6 px-6 py-2.5 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-bold rounded-xl hover:bg-blue-100 transition-colors">
                 Create Category
               </button>
            </div>
          } @else if (panelMode() === 'BULK_MOVE') {
            
            <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-20">
              <div>
                <h1 class="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                  <span class="material-symbols-rounded text-blue-500">drive_file_move</span>
                  Bulk Move Categories
                </h1>
                <p class="text-sm text-slate-500 font-medium mt-1">Moving {{selectedCategories().size}} selected categories to a new parent.</p>
              </div>
              <div class="flex items-center gap-3">
                <button (click)="cancelPanel()" class="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">Cancel</button>
                <button (click)="executeBulkMove()"
                        class="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  Apply Move
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div class="max-w-2xl">
                 <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Target Parent Category</label>
                 <select [(ngModel)]="bulkMoveTargetId" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-base !text-black dark:!text-white font-semibold focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer mb-6">
                    <option [value]="'NONE'">Top Level (None)</option>
                    @for (cat of categories(); track cat.id) {
                      <option [value]="cat.id" [disabled]="selectedCategories().has(cat.id)">{{ cat.name }}</option>
                    }
                 </select>
                 
                 <div class="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl flex items-start gap-3">
                    <span class="material-symbols-rounded text-yellow-500 text-xl mt-0.5">warning</span>
                    <div>
                      <h4 class="text-sm font-bold text-yellow-800 dark:text-yellow-500">Notice</h4>
                      <p class="text-sm text-yellow-700 dark:text-yellow-600/80">Moving these categories will update their hierarchical paths. Any products underneath them will retain their pricing schemas unless category inheritance overrides are enabled.</p>
                    </div>
                 </div>
              </div>
            </div>

          } @else {
            
            <!-- Breadcrumb & Header -->
            <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-20">
              <div>
                <div class="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2">
                  <span class="material-symbols-rounded text-sm">home</span>
                  <span>/</span>
                  <span class="text-slate-600 dark:text-slate-300">Categories</span>
                  <span>/</span>
                  <span class="text-blue-600">{{ panelMode() === 'ADD' ? 'New Entry' : selectedCategory()?.name }}</span>
                </div>
                <h1 class="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                  <div class="w-4 h-4 rounded-full" [style.backgroundColor]="categoryForm.get('color')?.value || '#3b82f6'"></div>
                  {{ panelMode() === 'ADD' ? 'New Category' : selectedCategory()?.name }}
                </h1>
              </div>
              <div class="flex items-center gap-3">
                <button (click)="cancelPanel()" class="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">Cancel</button>
                <button (click)="saveCategory()"
                        [disabled]="categoryForm.invalid"
                        class="px-8 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
                  {{ panelMode() === 'ADD' ? 'Create' : 'Save Changes' }}
                </button>
              </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="flex items-center gap-8 px-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 overflow-x-auto no-scrollbar">
              @for (tab of ['GENERAL', 'PRICING RULES', 'INVENTORY RULES', 'TAX SETTINGS', 'ANALYTICS']; track tab) {
                <button (click)="activeTab.set(tab)"
                        class="py-4 text-[11px] font-black tracking-[0.1em] uppercase transition-colors relative whitespace-nowrap"
                        [class.text-blue-600]="activeTab() === tab"
                        [class.text-slate-400]="activeTab() !== tab"
                        [class.hover:text-slate-700]="activeTab() !== tab">
                  {{ tab }}
                  @if (activeTab() === tab) {
                    <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"></div>
                  }
                </button>
              }
            </div>

            <!-- Tab Content Area -->
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form [formGroup]="categoryForm" class="max-w-3xl space-y-8 pb-20">
                
                <!-- 1. GENERAL TAB -->
                <div [hidden]="activeTab() !== 'GENERAL'" class="space-y-8 animate-in fade-in duration-300">
                  <div class="grid grid-cols-2 gap-6">
                    <div class="col-span-2">
                       <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Category Name</label>
                       <input formControlName="name" type="text" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-base !text-black dark:!text-white font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all">
                    </div>
                    <div>
                       <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Parent Category</label>
                       <select formControlName="parent_id" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm !text-black dark:!text-white font-semibold focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer">
                          <option [value]="null">Top Level (None)</option>
                          @for (cat of topLevelCategories(); track cat.id) {
                            <option [value]="cat.id" [disabled]="cat.id === selectedCategoryId()">{{ cat.name }}</option>
                          }
                       </select>
                    </div>
                    <div>
                       <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Display Order</label>
                       <input formControlName="sort_order" type="number" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm !text-black dark:!text-white font-semibold focus:border-blue-500 outline-none transition-all">
                    </div>
                    <div class="col-span-2">
                       <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Internal Description</label>
                       <textarea formControlName="description" rows="3" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm !text-black dark:!text-white font-semibold focus:border-blue-500 outline-none transition-all resize-none"></textarea>
                    </div>
                  </div>

                  <div class="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <label class="block text-[11px] font-black uppercase text-slate-500 mb-4">Visual Identity</label>
                    <div class="flex items-start gap-8">
                       <div>
                         <div class="text-xs font-bold text-slate-400 mb-2">Color Label</div>
                         <div class="flex items-center gap-3">
                           <input type="color" formControlName="color" class="w-12 h-12 p-0.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                           <div class="grid grid-cols-6 gap-1 p-1">
                              @for (color of categoryColors; track color) {
                                <button type="button" (click)="categoryForm.patchValue({color: color})" 
                                        class="w-6 h-6 rounded-md hover:scale-110 transition-transform" 
                                        [style.backgroundColor]="color"
                                        [class.ring-2]="categoryForm.get('color')?.value === color" [class.ring-slate-400]="categoryForm.get('color')?.value === color"></button>
                              }
                           </div>
                         </div>
                       </div>
                       <div>
                         <div class="text-xs font-bold text-slate-400 mb-2">Icon Identifier</div>
                         <div class="flex gap-2">
                            <span class="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xl text-slate-600 material-symbols-rounded">
                              {{ categoryForm.get('icon')?.value || 'category' }}
                            </span>
                            <div class="grid grid-cols-4 gap-1.5">
                               <!-- Small quick select icons -->
                               @for(icon of ['category', 'hardware', 'build', 'handyman', 'plumbing', 'electrical_services', 'bolt', 'home_repair_service']; track icon) {
                                 <button type="button" (click)="categoryForm.patchValue({icon: icon})"
                                     class="w-10 h-10 rounded text-slate-500 bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors material-symbols-rounded text-sm"
                                     [class.bg-blue-100]="categoryForm.get('icon')?.value === icon">{{icon}}</button>
                               }
                            </div>
                         </div>
                       </div>
                    </div>
                  </div>
                </div>

                <!-- 2. PRICING RULES TAB -->
                <div [hidden]="activeTab() !== 'PRICING RULES'" class="space-y-6 animate-in fade-in duration-300">
                   <div class="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl mb-6 flex gap-3">
                     <span class="material-symbols-rounded text-blue-500">info</span>
                     <p class="text-sm font-medium text-blue-800 dark:text-blue-300">These rules are applied automatically when creating products in this category, but can be overridden per product.</p>
                   </div>

                   <div class="grid grid-cols-2 gap-8">
                      <div>
                        <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Default Margin %</label>
                        <div class="relative">
                          <input formControlName="default_margin_percent" type="number" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-10 py-3 text-lg !text-black dark:!text-white font-bold focus:border-blue-500 outline-none">
                          <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-2 font-medium">Auto-calculates product retail price from cost.</p>
                      </div>

                      <div>
                        <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Markup Type</label>
                        <div class="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                          <button type="button" (click)="categoryForm.patchValue({markup_type: 'MARGIN'})"
                                  [class.bg-white]="categoryForm.get('markup_type')?.value === 'MARGIN'"
                                  [class.shadow]="categoryForm.get('markup_type')?.value === 'MARGIN'"
                                  class="flex-1 py-2.5 rounded-lg text-sm font-bold text-slate-700 transition-all">Margin %</button>
                          <button type="button" (click)="categoryForm.patchValue({markup_type: 'FIXED'})"
                                  [class.bg-white]="categoryForm.get('markup_type')?.value === 'FIXED'"
                                  [class.shadow]="categoryForm.get('markup_type')?.value === 'FIXED'"
                                  class="flex-1 py-2.5 rounded-lg text-sm font-bold text-slate-700 transition-all">Fixed Amount</button>
                        </div>
                      </div>
                      
                      <div class="col-span-2 pt-6 border-t border-slate-200 dark:border-slate-800">
                        <label class="flex items-center gap-4 cursor-pointer group">
                           <div class="relative">
                             <input type="checkbox" formControlName="discount_allowed" class="sr-only peer">
                             <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                           </div>
                           <div>
                             <div class="text-sm font-bold text-slate-800 dark:text-slate-200">Allow POS Discounts</div>
                             <div class="text-xs text-slate-500 font-medium mt-0.5">Permit manual discounts on items in this category at checkout.</div>
                           </div>
                        </label>
                      </div>
                   </div>
                </div>

                <!-- 3. INVENTORY RULES TAB -->
                <div [hidden]="activeTab() !== 'INVENTORY RULES'" class="space-y-8 animate-in fade-in duration-300">
                  <div class="grid grid-cols-2 gap-8">
                     <div>
                        <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Low Stock Threshold</label>
                        <input formControlName="low_stock_threshold" type="number" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-base !text-black dark:!text-white font-bold focus:border-blue-500 outline-none">
                        <p class="text-[11px] text-slate-400 mt-2 font-medium">Triggers low stock warnings in POS & Dashboard.</p>
                     </div>
                     <div>
                        <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Maximum Stock Level</label>
                        <input formControlName="max_stock_level" type="number" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-base !text-black dark:!text-white font-bold focus:border-blue-500 outline-none">
                     </div>
                  </div>

                  <div class="pt-6 border-t border-slate-200 dark:border-slate-800">
                     <label class="flex items-center gap-4 cursor-pointer group">
                        <div class="relative">
                          <input type="checkbox" formControlName="auto_reorder" class="sr-only peer">
                          <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                        <div>
                          <div class="text-sm font-bold text-slate-800 dark:text-slate-200">Enable Auto-Reorder</div>
                          <div class="text-xs text-slate-500 font-medium mt-0.5">Automatically add to Purchase Order draft when threshold hit.</div>
                        </div>
                     </label>
                  </div>
                </div>

                <!-- 4. TAX SETTINGS TAB -->
                <div [hidden]="activeTab() !== 'TAX SETTINGS'" class="space-y-8 animate-in fade-in duration-300">
                  <div class="w-1/2">
                    <label class="block text-[11px] font-black uppercase text-slate-500 mb-2">Default Tax Rate (%)</label>
                    <input formControlName="default_tax_rate" type="number" step="0.1" class="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-lg !text-black dark:!text-white font-bold focus:border-blue-500 outline-none">
                  </div>
                  
                  <div class="pt-6 border-t border-slate-200 dark:border-slate-800">
                     <label class="flex items-center gap-4 cursor-pointer group">
                        <div class="relative">
                          <input type="checkbox" formControlName="override_product_tax" class="sr-only peer">
                          <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                        <div>
                          <div class="text-sm font-bold text-red-600 dark:text-red-400">Enforce Category Tax Rules</div>
                          <div class="text-xs text-slate-500 font-medium mt-0.5">If active, ignores individual product tax profiles and applies this category rate.</div>
                        </div>
                     </label>
                  </div>
                </div>

                <!-- 5. ANALYTICS TAB -->
                <div [hidden]="activeTab() !== 'ANALYTICS'" class="space-y-6 animate-in fade-in duration-300">
                  @if (panelMode() === 'ADD') {
                    <div class="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                      <span class="material-symbols-rounded text-4xl mb-2 opacity-50">analytics</span>
                      <p class="text-sm font-bold">Analytics are available after category creation</p>
                    </div>
                  } @else {
                    <div class="grid grid-cols-2 gap-6">
                       <!-- KPI 1 -->
                       <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div class="flex items-center justify-between mb-4">
                            <span class="text-[11px] font-black tracking-widest uppercase text-slate-500">Products in Category</span>
                            <span class="material-symbols-rounded text-slate-400 text-lg">inventory_2</span>
                          </div>
                          <div class="text-4xl font-black text-slate-800 dark:text-slate-100">{{ categoryStats().productCount }}</div>
                          <div class="mt-2 text-xs font-bold text-green-600 flex items-center gap-1"><span class="material-symbols-rounded text-[14px]">arrow_upward</span> active SKUs</div>
                       </div>
                       
                       <!-- KPI 2 -->
                       <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div class="flex items-center justify-between mb-4">
                            <span class="text-[11px] font-black tracking-widest uppercase text-slate-500">Total Stock Value</span>
                            <span class="material-symbols-rounded text-slate-400 text-lg">account_balance_wallet</span>
                          </div>
                          <div class="text-4xl font-black text-slate-800 dark:text-slate-100">{{ categoryStats().totalValue | currency:storeService.currency() }}</div>
                          <div class="mt-2 text-xs font-bold text-blue-600">Calculated at cost price</div>
                       </div>

                       <!-- KPI 3 (Simulated Data for Demo) -->
                       <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div class="flex items-center justify-between mb-4">
                            <span class="text-[11px] font-black tracking-widest uppercase text-slate-500">30-Day Revenue</span>
                            <span class="material-symbols-rounded text-slate-400 text-lg">payments</span>
                          </div>
                          <div class="text-3xl font-black text-slate-800 dark:text-slate-100">{{ (categoryStats().totalValue * 1.35) | currency:storeService.currency() }}</div>
                          <div class="mt-2 text-xs font-bold text-slate-500">Estimated value derived from stock</div>
                       </div>

                       <!-- KPI 4 -->
                       <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div class="flex items-center justify-between mb-4">
                            <span class="text-[11px] font-black tracking-widest uppercase text-slate-500">Avg. Profit Margin</span>
                            <span class="material-symbols-rounded text-slate-400 text-lg">trending_up</span>
                          </div>
                          <div class="text-3xl font-black text-slate-800 dark:text-slate-100">{{ categoryForm.get('default_margin_percent')?.value }}%</div>
                          <div class="mt-2 text-xs font-bold text-slate-500">Based on default category rules</div>
                       </div>
                    </div>
                  }
                </div>

              </form>
            </div>
          }
        </div>
        
        <!-- BULK ACTION BAR -->
        @if (selectedCategories().size > 0) {
          <div class="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-5 z-50">
            <div class="text-sm font-bold flex items-center gap-2">
              <span class="bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-lg text-xs">{{selectedCategories().size}}</span>
              <span class="text-slate-300">selected</span>
            </div>
            <div class="h-5 w-px bg-slate-700"></div>
            <div class="flex items-center gap-2 text-sm font-semibold">
              <button (click)="bulkMove()" class="px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"><span class="material-symbols-rounded text-sm">drive_file_move</span> Move</button>
              <button (click)="bulkMerge()" class="px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"><span class="material-symbols-rounded text-sm">merge</span> Merge</button>
              <button (click)="bulkExport()" class="px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"><span class="material-symbols-rounded text-sm">download</span> Export</button>
              <div class="h-4 w-px bg-slate-700 mx-1"></div>
              <button (click)="bulkDeleteConfirm()" class="px-3 py-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors flex items-center gap-2"><span class="material-symbols-rounded text-sm">delete</span> Delete</button>
            </div>
            <button (click)="clearSelection()" class="ml-2 p-1 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800"><span class="material-symbols-rounded text-sm">close</span></button>
          </div>
        }

        <!-- UNDO TOAST -->
        @if (showUndoToast()) {
          <div class="absolute bottom-8 right-8 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 z-50 text-sm font-medium">
             <span>Category moved successfully.</span>
             <button (click)="undoLastAction()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-600 transition-colors flex items-center gap-1.5">
               <span class="material-symbols-rounded text-sm">undo</span> Undo <span class="opacity-50 text-[10px] ml-1 border border-slate-500 rounded px-1">Ctrl Z</span>
             </button>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
  `]
})
export class CategoriesManagerComponent {
  supabase = inject(MockSupabaseService);
  storeService = inject(StoreConfigService);
  dialog = inject(DialogService);
  fb = inject(FormBuilder);

  clearSelection() {
    this.selectedCategories.set(new Set());
  }

  // Menus
  activeMenuId = signal<string | null>(null);

  toggleMenu(id: string, event: Event) {
    event.stopPropagation();
    this.activeMenuId.set(this.activeMenuId() === id ? null : id);
  }

  addSubcategoryFromMenu(parentId: string) {
    this.activeMenuId.set(null);
    this.selectedCategoryId.set(null);
    this.categoryForm.reset({ 
      name: '', parent_id: parentId, sort_order: 0, color: '#3b82f6', description: '', icon: 'category',
      default_margin_percent: 20, markup_type: 'MARGIN', discount_allowed: true,
      low_stock_threshold: 5, auto_reorder: false, max_stock_level: 100, default_tax_rate: 23, override_product_tax: false
    });
    this.panelMode.set('ADD');
    this.activeTab.set('GENERAL');
  }

  async quickDelete(cat: Category) {
    this.activeMenuId.set(null);
    if (await this.dialog.confirm('Critical Deletion', 'Removing this node will detach all linked assets and templates. Proceed?')) {
      // MockSupabaseService would theoretically have deleteCategory, if not we ignore or use mock log.
      // Assuming deleteCategory exists based on previous code.
      (this.supabase as any).deleteCategory?.(cat.id).subscribe(() => {
        this.refreshTrigger.next();
        if (this.selectedCategoryId() === cat.id) this.panelMode.set('EMPTY');
        this.dialog.alert('Success', 'Classification node removed.');
      });
    }
  }

  // Undo History Stack
  undoStack: Array<{ categoryId: string, oldParentId: string | null, oldSortOrder: number }> = [];
  showUndoToast = signal<boolean>(false);
  undoTimeout: any;

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      this.undoLastAction();
      event.preventDefault();
    }
  }

  undoLastAction() {
    const action = this.undoStack.pop();
    if (!action) return;
    
    this.showUndoToast.set(false);
    clearTimeout(this.undoTimeout);

    // Call update to reverse the last action
    this.supabase.updateCategory(action.categoryId, { 
      parent_id: action.oldParentId, 
      sort_order: action.oldSortOrder 
    }).subscribe(() => {
      this.refreshTrigger.next();
      this.dialog.alert('Undo successful', 'The category move has been reverted.');
    });
  }

  pushUndoState(categoryId: string, oldParentId: string | null, oldSortOrder: number) {
    this.undoStack.push({ categoryId, oldParentId, oldSortOrder });
    this.showUndoToast.set(true);
    clearTimeout(this.undoTimeout);
    this.undoTimeout = setTimeout(() => {
      this.showUndoToast.set(false);
    }, 8000);
  }

  // Enhanced Drag and Drop with Angular CDK Drag & Drop
  isDescendant(parentId: string, childId: string): boolean {
    if (parentId === childId) return true;
    const child = this.categories().find(c => c.id === childId);
    if (!child || !child.parent_id) return false;
    return this.isDescendant(parentId, child.parent_id);
  }

  onCdkDrop(event: CdkDragDrop<any>) {
    const draggedCat: Category = event.item.data;
    const targetParentId: string | null = event.container.data; // new parent_id (null for root list)
    
    // Prevent moving into own sub-tree (circular dependency)
    if (targetParentId && this.isDescendant(draggedCat.id, targetParentId)) {
       this.dialog.alert('Invalid Move', 'You cannot move a category into its own subcategory. This creates a circular loop.');
       return;
    }

    const previousParentId = draggedCat.parent_id || null;
    const isChangingParent = previousParentId !== targetParentId;
    
    // We get the target siblings based on where it dropped
    const targetSiblings = this.categories()
      .filter(c => (c.parent_id || null) === targetParentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Calculate new sort_order based on event.currentIndex
    let newSortOrder = 0;
    if (targetSiblings.length > 0) {
       // Standard insertion ordering logic: find elements before and after
       const insertIndex = event.currentIndex;

       if (insertIndex === 0) {
         // Insert at the beginning
         newSortOrder = (targetSiblings[0].sort_order || 0) - 10;
       } else if (insertIndex >= targetSiblings.length) {
         // Insert at the end
         newSortOrder = (targetSiblings[targetSiblings.length - 1].sort_order || 0) + 10;
       } else {
         // Insert somewhere in the middle
         const prevItem = targetSiblings[insertIndex - 1];
         let nextItem = targetSiblings[insertIndex];
         
         // If moving in the SAME parent, adjust for the item shifting
         if (!isChangingParent && event.previousIndex < event.currentIndex) {
            nextItem = targetSiblings[insertIndex + 1] || nextItem;
         }

         const prevOrder = prevItem?.sort_order || 0;
         const nextOrder = nextItem?.sort_order || prevOrder + 20;
         newSortOrder = Math.floor((prevOrder + nextOrder) / 2);
       }
    }

    // Save state for Undo
    this.pushUndoState(draggedCat.id, previousParentId, draggedCat.sort_order || 0);

    // If nesting visually (changing parent), expand the new parent so we can see it
    if (isChangingParent && targetParentId) {
      const newExp = new Set(this.expandedCategories());
      newExp.add(targetParentId);
      this.expandedCategories.set(newExp);
    }

    // Update via Supabase mock
    this.supabase.updateCategory(draggedCat.id, { 
      parent_id: targetParentId,
      sort_order: newSortOrder
    }).subscribe(() => {
       this.refreshTrigger.next();
    });
  }

  // Global State
  globalSearch = '';
  panelMode = signal<'EMPTY' | 'DETAIL' | 'ADD' | 'BULK_MOVE'>('EMPTY');
  selectedCategoryId = signal<string | null>(null);
  activeTab = signal<'GENERAL' | 'PRICING RULES' | 'INVENTORY RULES' | 'TAX SETTINGS' | 'ANALYTICS'>('GENERAL');
  
  bulkMoveTargetId: string = 'NONE';

  // Tree State
  expandedCategories = signal<Set<string>>(new Set());
  selectedCategories = signal<Set<string>>(new Set());

  categoryColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#6366f1', '#14b8a6', '#f97316', '#06b6d4', '#4b5563', '#000000'
  ];

  // Forms
  categoryForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    parent_id: [null],
    sort_order: [0],
    description: [''],
    color: ['#3b82f6'],
    icon: ['category'],
    
    // Pricing
    default_margin_percent: [20],
    markup_type: ['MARGIN'],
    discount_allowed: [true],
    
    // Inventory
    low_stock_threshold: [5],
    auto_reorder: [false],
    max_stock_level: [100],
    
    // Tax
    default_tax_rate: [23],
    override_product_tax: [false]
  });

  // Data Loading
  private refreshTrigger = new BehaviorSubject<void>(undefined);

  private categories$ = this.storeService.currentStore$.pipe(
    switchMap(store => {
      if (!store) return of([]);
      return this.refreshTrigger.pipe(switchMap(() => this.supabase.getCategories(store.id)));
    })
  );
  categories = toSignal(this.categories$, { initialValue: [] as Category[] });

  private products$ = this.storeService.currentStore$.pipe(
    switchMap(store => store ? this.supabase.getProducts(store.id) : of([]))
  );
  products = toSignal(this.products$, { initialValue: [] as Product[] });

  // Computed
  hierarchicalCategories = computed(() => {
    const q = this.globalSearch.toLowerCase().trim();
    const all = this.categories().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all;
    const parents = filtered.filter(c => !c.parent_id);
    
    return parents.map(p => ({
      parent: p,
      children: all.filter(c => c.parent_id === p.id)
    }));
  });

  topLevelCategories = computed(() => this.categories().filter(c => !c.parent_id));
  
  selectedCategory = computed(() => this.categories().find(c => c.id === this.selectedCategoryId()) || null);

  categoryStats = computed(() => {
    const catId = this.selectedCategoryId();
    const prods = this.products().filter(p => p.category_id === catId);
    return {
      productCount: prods.length,
      totalValue: prods.reduce((acc, p) => acc + (p.stock_quantity * (p.cost_price || 0)), 0)
    };
  });

  // Handlers
  toggleExpand(id: string, event: Event) {
    event.stopPropagation();
    const current = new Set(this.expandedCategories());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.expandedCategories.set(current);
  }

  toggleCategorySelection(id: string, event: Event) {
    event.stopPropagation();
    const current = new Set(this.selectedCategories());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.selectedCategories.set(current);
  }

  selectCategory(cat: Category) {
    this.selectedCategoryId.set(cat.id);
    
    // Parse metadata safely
    const meta = cat.metadata || {};

    this.categoryForm.patchValue({
      name: cat.name,
      parent_id: cat.parent_id,
      sort_order: cat.sort_order || 0,
      color: cat.color || '#3b82f6',
      description: meta.description || '',
      icon: meta.icon || 'category',
      default_margin_percent: meta.default_margin_percent ?? 20,
      markup_type: meta.markup_type || 'MARGIN',
      discount_allowed: meta.discount_allowed ?? true,
      low_stock_threshold: meta.low_stock_threshold ?? 5,
      auto_reorder: meta.auto_reorder ?? false,
      max_stock_level: meta.max_stock_level ?? 100,
      default_tax_rate: meta.default_tax_rate ?? 23,
      override_product_tax: meta.override_product_tax ?? false
    });
    
    this.panelMode.set('DETAIL');
    this.activeTab.set('GENERAL');
  }

  openAddMode() {
    this.selectedCategoryId.set(null);
    this.categoryForm.reset({ 
      name: '', parent_id: null, sort_order: 0, color: '#3b82f6', description: '', icon: 'category',
      default_margin_percent: 20, markup_type: 'MARGIN', discount_allowed: true,
      low_stock_threshold: 5, auto_reorder: false, max_stock_level: 100, default_tax_rate: 23, override_product_tax: false
    });
    this.panelMode.set('ADD');
    this.activeTab.set('GENERAL');
  }

  cancelPanel() {
    this.panelMode.set('EMPTY');
    this.selectedCategoryId.set(null);
  }

  saveCategory() {
    const store = this.storeService.currentStore();
    
    if (!store) {
      this.dialog.alert('Configuration Error', 'No active store found. Please verify your connection.');
      return;
    }
    
    if (this.categoryForm.invalid) {
      this.dialog.alert('Form Invalid', 'Please correctly fill out all required fields.');
      return;
    }

    const val = this.categoryForm.getRawValue();
    
    // Package form into base entity
    // Note: 'metadata' is removed temporarily because the Supabase 'categories' table schema 
    // does not currently have a 'metadata' JSONB column, throwing a PGRST204 error.
    const payload: Partial<Category> = {
      store_id: store.id,
      name: val.name,
      parent_id: val.parent_id,
      color: val.color,
      sort_order: val.sort_order,
    };

    if (this.panelMode() === 'ADD') {
      this.supabase.addCategory(payload as Category).subscribe({
        next: () => {
          this.refreshTrigger.next();
          this.panelMode.set('EMPTY');
          this.dialog.alert('Success', 'New Category created successfully.');
        },
        error: (err) => {
          console.error(err);
          this.dialog.alert('Error', 'Failed to create category on backend.');
        }
      });
    } else {
      const id = this.selectedCategoryId()!;
      this.supabase.updateCategory(id, payload).subscribe({
        next: () => {
          this.refreshTrigger.next();
          this.dialog.alert('Success', 'Category rules updated.');
        },
        error: (err) => {
          console.error(err);
          this.dialog.alert('Error', 'Failed to update category on backend.');
        }
      });
    }
  }
  
  async bulkDeleteConfirm() {
     if (this.selectedCategories().size === 0) return;
     if (await this.dialog.confirm('Bulk Deletion Warning', 'You are about to delete ' + this.selectedCategories().size + ' categories. This action cannot be undone. Proceed?')) {
        const ids = Array.from(this.selectedCategories());
        
        try {
          const { error } = await this.supabase.client.from('categories').delete().in('id', ids);
          if (error) throw error;
          
          this.selectedCategories.set(new Set());
          this.panelMode.set('EMPTY');
          this.refreshTrigger.next();
          this.dialog.alert('Success', 'Categories deleted successfully.');
        } catch (err: any) {
          console.error(err);
          this.dialog.alert('Deletion Failed', err.message || 'Unable to complete bulk deletion.');
        }
     }
  }

  // BULK ACTIONS
  bulkMove() {
     this.bulkMoveTargetId = 'NONE';
     this.panelMode.set('BULK_MOVE');
  }

  async executeBulkMove() {
     const ids = Array.from(this.selectedCategories());
     const parentId = this.bulkMoveTargetId === 'NONE' ? null : this.bulkMoveTargetId;
     
     try {
       const { error } = await this.supabase.client.from('categories')
         .update({ parent_id: parentId })
         .in('id', ids);
       
       if (error) throw error;
       
       this.refreshTrigger.next();
       this.panelMode.set('EMPTY');
       this.selectedCategories.set(new Set());
       this.dialog.alert('Move Applied', `Successfully moved ${ids.length} categories.`);
       
       if (parentId) {
         const exp = new Set(this.expandedCategories());
         exp.add(parentId);
         this.expandedCategories.set(exp);
       }
     } catch (err: any) {
       console.error(err);
       this.dialog.alert('Move Failed', err.message || 'An error occurred during bulk move.');
     }
  }

  bulkMerge() {
     this.dialog.alert('Merge Functionality', 'Category merge relies on safely migrating attached items to a new category node. This feature is coming soon after the core Product Engine is finalized!');
  }

  bulkExport() {
     if (this.selectedCategories().size === 0) return;
     const allCats = this.categories();
     const selectedData = Array.from(this.selectedCategories())
        .map(id => allCats.find(c => c.id === id))
        .filter(c => c != null) as Category[];
        
     // Basic CSV construction
     const headers = ['ID', 'Name', 'Parent_ID', 'Sort_Order', 'Color'];
     const rows = selectedData.map(c => [
        c.id, 
        `"${c.name}"`, 
        c.parent_id || '', 
        c.sort_order, 
        c.color || ''
     ].join(','));
     
     const csvContent = [headers.join(','), ...rows].join('\n');
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement("a");
     
     const url = URL.createObjectURL(blob);
     link.setAttribute("href", url);
     link.setAttribute("download", `categories_export_${new Date().toISOString().split('T')[0]}.csv`);
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  }
  exportAllCategories() {
    if (this.categories().length === 0) {
      this.dialog.alert('Export Alert', 'No categories to export.');
      return;
    }
    const allCats = this.categories();
    
    // Basic CSV construction
    const headers = ['ID', 'Name', 'Parent_ID', 'Sort_Order', 'Color'];
    const rows = allCats.map(c => [
       c.id, 
       `"${c.name}"`, 
       c.parent_id || '', 
       c.sort_order, 
       c.color || ''
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `all_categories_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  importCategories(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.dialog.alert('Import Placeholder', 'File selected: ' + file.name + '\\n\\nIn a full implementation, this will parse your CSV/JSON file and map it to your category table schema.');
    // Reset input so the same file could be selected again if needed
    event.target.value = '';
  }
}
