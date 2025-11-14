import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LatestVehiclesComponent } from './components/latest-vehicles/latest-vehicles';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LatestVehiclesComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})


export class App {
  protected readonly title = signal('vehicle-tracker-frontend');
}
