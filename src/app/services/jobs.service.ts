// src/app/services/jobs.service.ts
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config';

export interface JobRecord {
  id: string;
  job_name: string;
  job_code: string;
  latitude: number | null;
  longitude: number | null;
}

export interface AllJobRecord {
  id: string;
  name: string;
  job_code: string;
  latitude: number | null;
  longitude: number | null;
}

// ✅ what we send when creating/updating (no job_id)
export type CreateJobInput = Omit<JobRecord, 'id'>;

// If your table name is different, change this:
const JOBS_TABLE = 'jobs';

@Injectable({ providedIn: 'root' })
export class JobsService {
  private baseUrl = `${SUPABASE_URL}/rest/v1/${JOBS_TABLE}`;

  private headers = new HttpHeaders({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });

  constructor(private http: HttpClient) {}

  // CREATE
  createJob(job: CreateJobInput) {
    const payload = {
      job_code: job.job_code,
      name: job.job_name,
      latitude: job.latitude,
      longitude: job.longitude,
    };
    return this.http.post<JobRecord[]>(this.baseUrl, payload, {
      headers: this.headers,
    });
  }

  // UPDATE by job_id
  updateJob(id: string, changes: CreateJobInput) {
    const url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(id)}`;

    const payload = {
      job_code: changes.job_code,
      name: changes.job_name,
      latitude: changes.latitude,
      longitude: changes.longitude,
    };

    return this.http.patch<JobRecord[]>(url, payload, {
      headers: this.headers,
    });
  }

  // DELETE by job_id
  deleteJob(job_id: string) {
    const url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(job_id)}`;

    return this.http.delete(url, {
      headers: this.headers,
    });
  }

  clearJobFromVehiclePositions(jobId: string) {
    const positionsUrl = `${SUPABASE_URL}/rest/v1/vehicle_positions?job_id=eq.${encodeURIComponent(
      jobId
    )}`;

    const payload = { job_id: null };

    return this.http.patch(positionsUrl, payload, {
      headers: this.headers,
    });
  }

  triggerVehiclePositionsRefresh() {
    const url = `${SUPABASE_URL}/rest/v1/rpc/refresh_vehicle_positions`;

    return this.http.post(url, {}, { headers: this.headers });
  }

  getJobById(id: string) {
    const url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${encodeURIComponent(id)}`;
    return this.http.get<JobRecord[]>(url, { headers: this.headers });
  }

  getAllJobs() {
    const url = `${SUPABASE_URL}/rest/v1/jobs`;
    return this.http.get<AllJobRecord[]>(url, { headers: this.headers });
  }
}
