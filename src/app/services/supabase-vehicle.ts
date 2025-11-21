import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config';

export interface LatestVehiclePosition {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_type: string | null;
  job_id: string | null;
  job_code: string | null;
  job_name: string | null;

  job_latitude?: number | null;
  job_longitude?: number | null;

  latitude: number;
  longitude: number;

  speed_kph: number | null;
  timestamp_utc: string;

  distance_m?: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseVehicleService {
  constructor(private http: HttpClient) {}

  getHeaders() {
    const headers = new HttpHeaders({
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    });

    return headers;
  }

  getLatestPositions(): Observable<LatestVehiclePosition[]> {
    const url = `${SUPABASE_URL}/rest/v1/latest_vehicle_positions`;

    const headers = this.getHeaders();

    const params = new HttpParams().set('select', '*');

    return this.http.get<LatestVehiclePosition[]>(url, { headers, params });
  }

  updateVehicleType(vehicleId: string, newType: string): Observable<any> {
    const url = `${SUPABASE_URL}/rest/v1/vehicles?id=eq.${vehicleId}`;

    const headers = this.getHeaders().set('Content-Type', 'application/json');
    // getHeaders should already add your apikey and anon/service token

    return this.http.patch(url, { type: newType }, { headers });
  }
}
