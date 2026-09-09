// <three-d-stage> — visor 3D minimalista (three.js) para el modelo del furgón.
// Adaptado del starter "omelette": se quitó la barra de descarga OBJ/GLB
// (no aplica a este inspector) y se dejaron solo escena, cámara, controles
// de órbita y auto-encuadre del objeto.

(() => {
  const stylesheet = `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      background: var(--stage-bg, #f0eee6);
      overflow: hidden;
    }
    canvas { display: block; outline: none; }
    .note {
      position: absolute;
      left: 16px;
      bottom: 16px;
      max-width: 60%;
      font: 400 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: rgba(26, 25, 21, 0.55);
      user-select: none;
    }
    .err {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font: 500 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #8a2f20;
      text-align: center;
      white-space: pre-line;
    }
  `;

  class ThreeDStage extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = stylesheet;
      root.appendChild(style);
      this._err = document.createElement('div');
      this._err.className = 'err';
      root.appendChild(this._err);
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Arrastra para rotar · rueda para zoom · click derecho para desplazar';
      root.appendChild(note);
      this.ready = new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
      });
    }

    connectedCallback() {
      if (this._booted) {
        if (this._renderer) {
          this._renderer.setAnimationLoop(this._loop);
          this._ro && this._ro.observe(this);
        }
        return;
      }
      this._booted = true;
      this._boot().catch((err) => {
        this._err.style.display = 'flex';
        this._err.textContent =
          'No se pudo cargar three.js.\n' +
          'Revisa que el importmap fijado esté en <head> antes de cualquier script módulo.\n\n' +
          String(err && err.message ? err.message : err);
        this._readyReject(err);
      });
    }

    async _boot() {
      const bg = this.getAttribute('background');
      if (bg) this.style.setProperty('--stage-bg', bg);
      const [THREE, controlsMod] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      this._THREE = THREE;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.localClippingEnabled = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.VSMShadowMap;
      this._renderer = renderer;
      this.shadowRoot.insertBefore(renderer.domElement, this._err);

      const scene = new THREE.Scene();
      this._scene = scene;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
      camera.position.set(3, 2.2, 4);
      this._camera = camera;

      const controls = new controlsMod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      this._controls = controls;

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d8e2, 1.0));
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(5, 8, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0002;
      this._key = key;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xfff6ea, 0.9);
      fill.position.set(-6, 4, -5);
      scene.add(fill);
      const backLight = new THREE.DirectionalLight(0xe8f0ff, 0.5);
      backLight.position.set(6, 2, -6);
      scene.add(backLight);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.ShadowMaterial({ opacity: 0.18 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this._ground = ground;
      scene.add(ground);

      const fit = () => {
        const w = this.clientWidth || 1;
        const h = this.clientHeight || 1;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      fit();
      this._ro = new ResizeObserver(fit);
      this._loop = () => {
        controls.update();
        renderer.render(scene, camera);
      };
      if (this.isConnected) {
        this._ro.observe(this);
        renderer.setAnimationLoop(this._loop);
      }

      this._readyResolve({ THREE });
    }

    disconnectedCallback() {
      if (this._renderer) this._renderer.setAnimationLoop(null);
      if (this._ro) this._ro.disconnect();
    }

    setObject(object) {
      const THREE = this._THREE;
      if (!THREE) throw new Error('three-d-stage: not ready — await stage.ready first');
      if (this._object) this._scene.remove(this._object);
      this._object = object;
      object.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        this._ground.position.y = box.min.y;
        const center = box.getCenter(new THREE.Vector3());
        const dir = new THREE.Vector3(1, 0.55, 1.25).normalize();
        // Encuadre ajustado al rectángulo real del contenedor (no una esfera
        // envolvente): para objetos muy alargados (p. ej. un camión con
        // remolque) una esfera deja mucho espacio vacío arriba/abajo porque
        // reserva sitio para cualquier ángulo de rotación. Aquí se proyectan
        // las 8 esquinas de la caja sobre los ejes derecha/arriba de ESTA
        // cámara y se calcula la distancia mínima que evita recortes en
        // ambos ejes, respetando el aspect ratio real del <three-d-stage>.
        const worldUp = new THREE.Vector3(0, 1, 0);
        const camForward = dir.clone().negate();
        const camRight = new THREE.Vector3().crossVectors(camForward, worldUp).normalize();
        const camUp = new THREE.Vector3().crossVectors(camRight, camForward).normalize();
        let halfW = 0, halfH = 0;
        const corner = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
          corner
            .set(
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z
            )
            .sub(center);
          halfW = Math.max(halfW, Math.abs(corner.dot(camRight)));
          halfH = Math.max(halfH, Math.abs(corner.dot(camUp)));
        }
        const aspect = (this.clientWidth || 1) / (this.clientHeight || 1);
        const vFov = (this._camera.fov * Math.PI) / 180;
        const distV = halfH / Math.tan(vFov / 2);
        const distH = halfW / (Math.tan(vFov / 2) * aspect);
        const dist = Math.max(distV, distH) * 1.15;
        this._camera.position.copy(center).add(dir.clone().multiplyScalar(dist));
        this._camera.near = Math.max(dist / 100, 0.01);
        this._camera.far = dist * 100;
        this._camera.updateProjectionMatrix();
        this._controls.target.copy(center);
        this._controls.update();
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const span = sphere.radius * 3;
        this._key.shadow.camera.left = -span;
        this._key.shadow.camera.right = span;
        this._key.shadow.camera.top = span;
        this._key.shadow.camera.bottom = -span;
        this._key.shadow.camera.updateProjectionMatrix();
      }
      this._scene.add(object);
    }
  }

  if (!customElements.get('three-d-stage')) {
    customElements.define('three-d-stage', ThreeDStage);
  }
})();
