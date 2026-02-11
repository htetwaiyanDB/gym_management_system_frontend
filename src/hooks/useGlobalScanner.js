import { useEffect, useState, useCallback } from "react";
import {
  ATTENDANCE_SCAN_CONTROL_STORAGE_KEY,
  getAttendanceScanControlStatus,
} from "../api/attendanceApi";

/**
 * Global scanner state hook for Admin-controlled attendance scanning.
 *
 * - Only Admin can toggle scanning ON/OFF
 * - User and Trainer pages use this hook to respect the global state
 * - State is synchronized across tabs via localStorage + storage events
 * - Fails CLOSED: defaults to OFF if state cannot be read
 *
 * @returns {Object} {
 *   isScanningEnabled: boolean - whether admin has enabled scanning globally
 *   isLoading: boolean - whether we're fetching the initial state
 *   error: string|null - any error message
 *   refresh: function - manually refresh the scanner status
 * }
 */
export function useGlobalScanner() {
  const [isScanningEnabled, setIsScanningEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getAttendanceScanControlStatus();
      setIsScanningEnabled(!!result?.isActive);
      setError(null);
    } catch (e) {
      setIsScanningEnabled(false);
      setError("Failed to load scanner status");
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const loadScanControl = async () => {
      try {
        const result = await getAttendanceScanControlStatus();
        if (!alive) return;
        setIsScanningEnabled(!!result?.isActive);
      } catch {
        if (!alive) return;
        setIsScanningEnabled(false);
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    loadScanControl();

    // Poll every 10 seconds to sync with admin changes
    const intervalId = window.setInterval(loadScanControl, 10000);

    // Listen for storage events to sync across tabs
    const onStorage = (event) => {
      if (event.key !== ATTENDANCE_SCAN_CONTROL_STORAGE_KEY) return;
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        setIsScanningEnabled(!!next?.isActive);
      } catch {
        setIsScanningEnabled(false);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    isScanningEnabled,
    isLoading,
    error,
    refresh,
  };
}

export default useGlobalScanner;
