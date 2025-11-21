import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { NgIf, NgFor, CommonModule } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { SupabaseVehicleService, LatestVehiclePosition } from '../../services/supabase-vehicle';
import { FormsModule } from '@angular/forms';
import { LatestVehicle } from '../../models/latest-vehicle.model';

import * as L from 'leaflet';
import { isValidDate } from 'rxjs/internal/util/isDate';

// Use Leaflet's CDN-hosted marker images
const defaultIcon = L.icon({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Make this the default icon for all markers
(L.Marker as any).prototype.options.icon = defaultIcon;

interface JobSummary {
  job_id: string | null;
  job_code: string;
  job_name: string;
  vehicle_count: number;
  vehicle_Names: string[];
}

type SortColumn =
  | 'vehicle_name'
  | 'vehicle_type'
  | 'job_code'
  | 'latitude'
  | 'longitude'
  | 'timestamp_utc';

@Component({
  selector: 'app-latest-vehicles',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor, FormsModule],
  templateUrl: './latest-vehicles.html',
  styleUrls: ['./latest-vehicles.css'],
})
export class LatestVehiclesComponent implements OnInit, OnDestroy, AfterViewInit {
  vehicles: LatestVehiclePosition[] = [];
  loading = false;
  error: string | null = null;
  lastUpdated: Date | null = null;

  jobsSummary: JobSummary[] = [];

  private autoRefreshSub?: Subscription;
  private readonly REFRESH_INTERVAL_MS = 300_000; // 5 Minutes

  // sort columns
  sortColumn: SortColumn = 'vehicle_name';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Leaflet map
  private map?: L.Map;
  private markersLayer?: L.LayerGroup;

  // Filters
  filterJobID: string = 'ALL'; // All or UNASSIGNED or specific job_id
  filterSearch: string = '';
  isCheckedCivil: boolean = true;
  isCheckedPipeline: boolean = true;

  constructor(private vehicleService: SupabaseVehicleService) {}

  ngOnInit(): void {
    this.loadVehicles();

    // Auto-refresh every 30 seconds
    this.autoRefreshSub = interval(this.REFRESH_INTERVAL_MS).subscribe(() => {
      this.loadVehicles(false); // refresh silently without big loading state
    });
  }

  ngAfterViewInit(): void {
    // Initialize the map once the view is rendered
    this.initMap();
  }

  ngOnDestroy(): void {
    // Clean up subscription when component is destroyed
    this.autoRefreshSub?.unsubscribe();
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      // toggle direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  loadVehicles(showSpinner: boolean = true): void {
    if (showSpinner) {
      this.loading = true;
    }
    this.error = null;

    this.vehicleService.getLatestPositions().subscribe({
      next: (data) => {
        this.vehicles = data;
        this.lastUpdated = new Date();

        this.vehicles = data.map((v: any) => {
          let distance_m: number | null = null;

          if (
            v.job_id &&
            v.job_latitude != null &&
            v.job_longitude != null &&
            v.latitude != null &&
            v.longitude != null
          ) {
            distance_m = this.haversineDistanceMeters(
              v.latitude,
              v.longitude,
              v.job_latitude,
              v.job_longitude
            );
          }

          // If distance 9999 then Unassigned
          const isInvalidDistance = distance_m === 9999;

          // DEBUG
          // console.log(isInvalidDistance, v.vehicle_name, v.job_code, distance_m);

          if (isInvalidDistance) {
            v.job_id = null;
            v.job_code = 'Unassigned';
            v.job_name = 'No Job Assigned';
            distance_m = this.trueHaversineDistanceMeters(
              v.latitude,
              v.longitude,
              v.job_latitude,
              v.job_longitude
            );
          }

          return {
            ...v,
            distance_m,
          };
        });

        this.buildJobsSummary();
        this.updateMapMarkers();
        if (showSpinner) {
          this.loading = false;
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load latest vehicle positions.';
        if (showSpinner) {
          this.loading = false;
        }
      },
    });
  }

  private buildJobsSummary(): void {
    const summaryMap = new Map<string, JobSummary>();

    for (const v of this.vehicles) {
      // Use a special key for "no job"
      const key = v.job_id || 'UNASSIGNED';

      const existing = summaryMap.get(key);

      if (existing) {
        existing.vehicle_count += 1;
        existing.vehicle_Names.push(v.vehicle_name || '');
      } else {
        const isUnassigned = key === 'UNASSIGNED';

        summaryMap.set(key, {
          job_id: isUnassigned ? null : v.job_id,
          job_code: isUnassigned ? 'Unassigned' : v.job_code || 'Unassigned',
          job_name: isUnassigned ? 'No job assigned' : v.job_name || 'No job assigned',
          vehicle_count: 1,
          vehicle_Names: [v.vehicle_name || ''],
        });
      }
    }

    // Jobs with vehicles first, Unassigned last, then by job_code
    this.jobsSummary = Array.from(summaryMap.values()).sort((a, b) => {
      const aUnassigned = a.job_id === null;
      const bUnassigned = b.job_id === null;

      if (aUnassigned && !bUnassigned) return 1;
      if (!aUnassigned && bUnassigned) return -1;

      return a.job_code.localeCompare(b.job_code);
    });
  }

  private initMap(): void {
    if (this.map) return; // already initialized

    this.map = L.map('vehicle-map', {
      center: [46.2, -119.2], // rough Tri-Cities center; you can tweak
      zoom: 10,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
  }

  private updateMapMarkers(): void {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();

    const latlngs: L.LatLngExpression[] = [];

    for (const v of this.vehicles) {
      if (v.latitude == null || v.longitude == null) continue;

      const latlng: L.LatLngExpression = [v.latitude, v.longitude];
      latlngs.push(latlng);

      const labelParts = [v.vehicle_name];
      if (v.job_code) {
        labelParts.push(`Job: ${v.job_code}`);
      }

      const popupContent = `
        <div style="font-size: 12px;">
          <strong>${v.vehicle_name}</strong><br/>
          ${v.vehicle_type || ''}<br/>
          ${v.job_code ? `Job: ${v.job_code} – ${v.job_name || ''}<br/>` : ''}
          Lat: ${v.latitude.toFixed(5)}, Lng: ${v.longitude.toFixed(5)}<br/>
          Updated: ${v.timestamp_utc}
        </div>
      `;

      L.marker(latlng).bindPopup(popupContent).addTo(this.markersLayer);
    }

    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs);
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 200);
  }

  get sortedVehicles(): LatestVehiclePosition[] {
    if (!this.vehicles || this.vehicles.length === 0) {
      return [];
    }

    const data = [...this.vehicles];

    data.sort((a, b) => {
      const col = this.sortColumn;
      const dir = this.sortDirection === 'asc' ? 1 : -1;

      let av: any = (a as any)[col];
      let bv: any = (b as any)[col];

      // Normalize null/undefined
      if (av === null || av === undefined) av = '';
      if (bv === null || bv === undefined) bv = '';

      // Numeric columns
      if (col === 'latitude' || col === 'longitude') {
        const an = Number(av);
        const bn = Number(bv);
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
        return 0;
      }

      // Timestamp column
      if (col === 'timestamp_utc') {
        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        if (ad < bd) return -1 * dir;
        if (ad > bd) return 1 * dir;
        return 0;
      }

      // String-ish columns
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return -1 * dir;
      if (as > bs) return 1 * dir;
      return 0;
    });

    return data;
  }

  get filteredVehicles(): LatestVehicle[] {
    let rows = [...this.vehicles];

    // 1) Filter by job
    if (this.filterJobID === 'UNASSIGNED') {
      rows = rows.filter((v) => !v.job_id);
    } else if (this.filterJobID !== 'ALL') {
      rows = rows.filter((v) => v.job_id === this.filterJobID);
    }

    // 2) text search
    const q = this.filterSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((v) => {
        const name = (v.vehicle_name || '').toLowerCase();
        const jobCode = (v.job_code || '').toLowerCase();
        const jobName = (v.job_name || '').toLowerCase();
        return name.includes(q) || jobCode.includes(q) || jobName.includes(q);
      });
    }

    // 2.5) checkboxes for Civil or Pipeline
    if (this.isCheckedCivil || this.isCheckedPipeline) {
      rows = rows.filter((v) => {
        const t = (v.vehicle_type || '').toLowerCase();
        const isCivil = t === 'civil';
        const isPipeline = t === 'pipeline';

        return (this.isCheckedCivil && isCivil) || (this.isCheckedPipeline && isPipeline);
      });
    }

    // 3) Sorting
    if (this.sortColumn && this.sortDirection) {
      rows.sort((a, b) => {
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        let av = a[this.sortColumn];
        let bv = b[this.sortColumn];

        // Normalize undefined/null
        if (av === null || av === undefined) av = '';
        if (bv === null || bv === undefined) bv = '';

        // Compare numbers vs strings
        const aNum = typeof av === 'number' ? av : Number.NaN;
        const bNum = typeof bv === 'number' ? bv : Number.NaN;

        let cmp: number;

        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          cmp = aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
        } else {
          const as = String(av).toLowerCase();
          const bs = String(bv).toLowerCase();
          cmp = as < bs ? -1 : as > bs ? 1 : 0;
        }

        return cmp * dir;
      });
    }

    return rows;
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      // Flip direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  private haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const dφ = toRad(lat2 - lat1);
    const dλ = toRad(lon2 - lon1);

    const a =
      Math.sin(dφ / 2) * Math.sin(dφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;

    if (distance > 2000) {
      return 9999;
    } else {
      return R * c;
    }
  }

  private trueHaversineDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const dφ = toRad(lat2 - lat1);
    const dλ = toRad(lon2 - lon1);

    const a =
      Math.sin(dφ / 2) * Math.sin(dφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  editingTypeId: string | null = null;
  typeOptions: string[] = ['Civil', 'Pipeline'];

  startEditType(v: LatestVehicle): void {
    this.editingTypeId = v.vehicle_id;
  }

  cancelEditType(): void {
    this.editingTypeId = null;
  }

  onTypeChange(v: LatestVehicle, newType: string): void {
    // call Supabase to update the vehicle
    this.vehicleService.updateVehicleType(v.vehicle_id, newType).subscribe({
      next: () => {
        // update local state so UI reflects the change
        v.vehicle_type = newType;
        this.editingTypeId = null;
      },
      error: (err) => {
        console.error('Failed to update vehicle Type', err);
        // optional: show a toast / error banner
        this.editingTypeId = null;
      },
    });
  }
}
