import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
const source = await readFile(new URL('../pages/Prescriptions.tsx', import.meta.url), 'utf8');
const body = transformSync(source.slice(source.indexOf('const filterProcedureServices ='), source.indexOf('export default function Prescriptions')), { loader: 'ts' }).code;
const filter = new Function(`${body};return filterProcedureServices;`)();
const services = [
  { id: '1', nombre: 'Hematología', categoria: 'Laboratorio', descripcion: 'Análisis sanguíneo', precio_base: 200 },
  { id: '2', nombre: 'CHEM 15', categoria: 'Laboratorio', descripcion: 'Perfil químico', precio_base: 550 },
  { id: '3', nombre: 'Consulta', categoria: 'Medicina', descripcion: null, precio_base: null },
];
test('busca por nombre parcial, categoría o descripción sin distinguir tildes y mayúsculas', () => {
  for (const query of ['hemato', 'HEMATOLOGÍA', '  sanguineo  ', 'laboratorio hemato']) assert.deepEqual(filter(services, query).map(x => x.id), ['1']);
  assert.deepEqual(filter(services, 'LABORATORIO').map(x => x.id), ['1', '2']);
  assert.deepEqual(filter(services, 'quimico').map(x => x.id), ['2']);
});
test('consulta vacía recupera el catálogo; resultados inexistentes no crean opciones ni alteran precios', () => {
  const before = JSON.stringify(services);
  assert.deepEqual(filter(services, ''), services); assert.deepEqual(filter(services, '   '), services);
  assert.deepEqual(filter(services, 'servicio inexistente'), []);
  assert.equal(JSON.stringify(services), before);
});
test('la búsqueda filtra el catálogo existente y deja la selección y precios a los controles actuales', () => {
  assert.match(source, /filteredServiceOptions\.map\(service/);
  assert.match(source, /setServiceSearch\(event\.target\.value\); setSelectedService\(''\)/);
  assert.match(source, /disabled=\{service\.precio_base === null\}/);
  assert.match(source, /No se encontraron servicios con esa búsqueda/);
});
test('Enter en el buscador no guarda la receta accidentalmente', () => {
  const handler = source.match(/onKeyDown=\{event => \{ (if \(event\.key === 'Enter'\) event\.preventDefault\(\);) \}\}/)[1];
  for (const key of ['Enter', 'ArrowDown', 'Escape', 'a']) {
    let prevented = false; new Function('event', handler)({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, key === 'Enter');
  }
});
