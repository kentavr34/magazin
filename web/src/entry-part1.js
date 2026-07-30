/* Точка входа части I — тот же порядок подключения, что был
   у отдельных <script> тегов раньше. three.js — первым, легаси-игровой
   код (пока классический, немодульный <script> внутри part1.html)
   читает window.THREE сразу после этого модуля. */
import './vendor/three-bridge.js';
import './modules/profile.js';
import './modules/progress.js';
import './modules/coins.js';
import './modules/admin.js';
import './modules/inventory.js';
import './modules/mapview.js';
import './modules/controls.js';
import './modules/detail.js';
import './modules/updater.js';
