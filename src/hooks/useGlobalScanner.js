import { useEffect, useState, useCallback } from "react";
import {
  ATTENDANCE_SCAN_CONTROL_STORAGE_KEY,
  getAttendanceScanControlStatus,
  readAttendanceScanControlLocal,
  saveAttendanceScanControlLocal,
} from "../api/attendanceApi";

/**
 * Global scanner state hook for Admin-controlled attendance scanning.
 *
 * - Only Admin can toggle scanning ON/OFF
 * - User and Trainer pages use this hook to respect the global state
 * - State is synchronized across tabs via localStorage + storage events
 * - Fails OPEN: defaults to ON if no localStorage value exists (for offline support)
 *
 * @returns {Object} {
 *   isScanningEnabled: boolean - whether admin has enabled scanning globally
 *   isLoading: boolean - whether we're fetching the initial state
 *   error: string|null - any error message
 *   refresh: function - manually refresh the scanner status
 *   setIsScanningEnabled: function - manually set scanner state (for admin use)
 * }
 */
export function useGlobalScanner() {
  // Initialize from localStorage immediately to avoid flicker
  const getInitialState = () => {
    const cached = readAttendanceScanControlLocal();
    console.log("[useGlobalScanner] Initial localStorage value:", cached);
    // Default to ON if no cached value exists
    return cached ? !!cached.isActive : true;
  };

  const [isScanningEnabled, setIsScanningEnabledState] = useState(getInitialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Wrapper to update both state and localStorage
  const setIsScanningEnabled = useCallback((value) => {
    const boolValue = !!value;
    setIsScanningEnabledState(boolValue);
    saveAttendanceScanControlLocal(boolValue);
    console.log("[useGlobalScanner] Set scanner state:", boolValue);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await getAttendanceScanControlStatus();
      const newValue = !!result?.isActive;
      setIsScanningEnabledState(newValue);
      saveAttendanceScanControlLocal(newValue);
      setError(null);
    } catch (e) {
      // On API error, default to ON (true) so scanning still works
      setIsScanningEnabledState(true);
      setError("Failed to load scanner status");
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const loadScanControl = async () => {
      try {
        const result = await getAttendanceScanControlStatus();
        console.log("[useGlobalScanner] API result:", result);
        if (!alive) return;
        const newValue = !!result?.isActive;
        setIsScanningEnabledState(newValue);
        saveAttendanceScanControlLocal(newValue);
      } catch {
        if (!alive) return;
        // On API error, default to ON (true) so scanning still works
        console.log("[useGlobalScanner] API failed, defaulting to ON");
        setIsScanningEnabledState(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    loadScanControl();

    // Poll every 3 seconds to sync with admin changes (faster sync)
    const intervalId = window.setInterval(loadScanControl, 3000);

    // Listen for storage events to sync across tabs
    const onStorage = (event) => {
      if (event.key !== ATTENDANCE_SCAN_CONTROL_STORAGE_KEY) return;
      console.log("[useGlobalScanner] Storage event received:", event.newValue);
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        setIsScanningEnabledState(next ? !!next.isActive : true);
      } catch {
        setIsScanningEnabledState(true);
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
    setIsScanningEnabled,
  };
}

export default useGlobalScanner;
