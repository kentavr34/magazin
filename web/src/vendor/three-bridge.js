/* three.js теперь приходит из npm (см. package.json), а не из
   vendor/three.min.js — версия зафиксирована в package.json,
   Vite сам минифицирует и трясёт дерево импортов.

   window.THREE оставлен ради обратной совместимости: легаси-игровой
   код в part1.html/part2.html (пока ещё один большой классический
   скрипт, не модуль — это следующий, гораздо больший этап) обращается
   к THREE.* как к глобальной переменной и не тронут в этом переходе. */
import * as THREE from 'three';
window.THREE = THREE;
export { THREE };
