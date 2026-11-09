import { expect, test } from 'vitest';
import { gpsToImage, imageToGps, validateCampusMap, type CampusMap } from '../../shared/campus-map';
import { parseOutdoorGraph } from '../../shared/outdoor-graph';
const map = (): CampusMap => ({ image: 'data:image/png;base64,AAAA', anchors: [
  { x: 0.1, y: 0.1, latitude: 1, longitude: 2 },
  { x: 0.9, y: 0.1, latitude: 1, longitude: 2.001 },
  { x: 0.1, y: 0.9, latitude: 0.999, longitude: 2 },
] });
test('calibrates from three known landmarks and round-trips image/GPS positions', () => {
  const calibrated = validateCampusMap(map());
  const gps = imageToGps(calibrated, { x: 0.5, y: 0.5 })!;
  expect(gps.latitude).toBeCloseTo(0.9995); expect(gps.longitude).toBeCloseTo(2.0005);
  const pixel = gpsToImage(calibrated, gps)!;
  expect(pixel.x).toBeCloseTo(0.5); expect(pixel.y).toBeCloseTo(0.5);
});
test('handles rotated reference images without assuming north is up', () => {
  const rotated = map(); rotated.anchors[1] = { x: 0.9, y: 0.1, latitude: 0.999, longitude: 2 };
  rotated.anchors[2] = { x: 0.1, y: 0.9, latitude: 1, longitude: 2.001 };
  const gps = imageToGps(validateCampusMap(rotated), { x: 0.9, y: 0.1 })!;
  expect(gps.latitude).toBeCloseTo(0.999); expect(gps.longitude).toBeCloseTo(2);
});
test('does not invent GPS positions before three anchors exist', () => {
  const draft = { ...map(), anchors: map().anchors.slice(0, 2) };
  expect(imageToGps(draft, { x: 0.5, y: 0.5 })).toBeNull();
  expect(() => parseOutdoorGraph({ version: 1, verified: true, nodes: [], edges: [], referenceMap: draft })).toThrow('three GPS anchors');
});
test('rejects unsafe images, oversized data, collinear anchors and invalid coordinates', () => {
  expect(() => validateCampusMap({ ...map(), image: 'data:image/svg+xml;base64,AAAA' })).toThrow();
  expect(() => validateCampusMap({ ...map(), image: 'https://example.test/map.png' })).toThrow();
  expect(() => validateCampusMap({ ...map(), image: 'data:image/png;base64,' + 'A'.repeat(1_400_000) })).toThrow();
  const collinear = map(); collinear.anchors[2] = { ...collinear.anchors[2], x: 0.5, y: 0.1 };
  expect(() => validateCampusMap(collinear)).toThrow('not on one line');
  const invalid = map(); invalid.anchors[0].latitude = 91;
  expect(() => validateCampusMap(invalid)).toThrow('Invalid campus map anchor');
});
