import { Injectable, signal } from '@angular/core';

export interface DialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'ALERT' | 'CONFIRM' | 'PROMPT';
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  resolve?: (result: any) => void;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  readonly state = signal<DialogState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'ALERT'
  });

  /**
   * Shows a prompt dialog with an input field.
   * Returns the string value if confirmed, null if cancelled.
   */
  prompt(title: string, message: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
      this.state.set({
        isOpen: true,
        title,
        message,
        type: 'PROMPT',
        defaultValue,
        resolve
      });
    });
  }

  /**
   * Shows an alert dialog with a single OK button.
   * @param title Header text
   * @param message Body text (supports \n newlines)
   * @param confirmText Button label (default: OK)
   */
  alert(title: string, message: string, confirmText = 'OK'): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({
        isOpen: true,
        title,
        message,
        type: 'ALERT',
        confirmText,
        resolve
      });
    });
  }

  /**
   * Shows a confirm dialog with OK/Cancel buttons.
   * Returns true if confirmed, false if cancelled.
   */
  confirm(title: string, message: string, confirmText = 'Confirm', cancelText = 'Cancel'): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({
        isOpen: true,
        title,
        message,
        type: 'CONFIRM',
        confirmText,
        cancelText,
        resolve
      });
    });
  }

  close(result: any) {
    const currentState = this.state();
    if (currentState.resolve) {
      currentState.resolve(result);
    }
    this.state.set({ ...currentState, isOpen: false });
  }
}