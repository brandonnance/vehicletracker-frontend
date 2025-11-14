export interface LatestVehicle {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_type?: string | null;

  job_id: string | null;
  job_code: string | null;
  job_name: string | null;

  // NEW: job coords from the view
  job_latitude?: number | null;
  job_longitude?: number | null;

  latitude: number;
  longitude: number;

  speed_kph?: number | null;
  heading?: number | null;
  odometer_km?: number | null;

  timestamp_utc: string;   // ISO string returned by Supabase

  // NEW: computed in frontend
  distance_m?: number | null;

  // raw JSON from Samsara, optional
  source_raw?: any;
}
