export const nowIso = () => new Date().toISOString();

export const formatDuration = (startAt: string | null, finishAt: string | null) => {
  if (!startAt) {
    return "";
  }

  const end = finishAt ? Date.parse(finishAt) : Date.now();
  const seconds = Math.max(0, Math.round((end - Date.parse(startAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};
