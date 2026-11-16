export interface MapPoint { id: string; x: number; y: number }
export interface MapCluster { ids: string[]; x: number; y: number }

/** Cluster in screen pixels so touch targets remain distinct as the map zooms. */
export function clusterMapPoints(points: readonly MapPoint[], distance: number): MapCluster[] {
  const clusters = points.map(({ id, x, y }) => ({ ids: [id], x, y }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let left = 0; left < clusters.length; left++) {
      for (let right = left + 1; right < clusters.length; right++) {
        const a = clusters[left];
        const b = clusters[right];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= distance) continue;
        const count = a.ids.length + b.ids.length;
        clusters[left] = {
          ids: [...a.ids, ...b.ids],
          x: (a.x * a.ids.length + b.x * b.ids.length) / count,
          y: (a.y * a.ids.length + b.y * b.ids.length) / count,
        };
        clusters.splice(right, 1);
        merged = true;
        break outer;
      }
    }
  }
  return clusters;
}
