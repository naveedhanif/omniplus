import 'zone.js';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
    .then(() => console.log('Angular application bootstrapped successfully from main.ts!'))
    .catch(err => {
        console.error('Angular Bootstrap Error:', err);
        // Display a more user-friendly error on the page itself
        const root = document.querySelector('app-root');
        if (root) {
            root.innerHTML = `
              <div style="color: #b91c1c; background-color: #fee2e2; padding: 20px; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box;">
                  <h1 style="font-size: 1.5rem; margin-bottom: 1rem; color: #7f1d1d;">Application Failed to Start</h1>
                  <p style="margin-bottom: 1rem;">There was an error initializing the application.</p>
                  <pre style="background: #fff; border: 1px solid #fecaca; padding: 1rem; border-radius: 0.5rem; max-width: 80%; overflow: auto; text-align: left;">${err.message}\n\n${err.stack}</pre>
              </div>
          `;
        }
    });
