import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create();

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const container = document.getElementById("container");
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
await world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

components.init();

const githubUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", { type: "text/javascript" });
const workerUrl = URL.createObjectURL(workerFile);
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("update", () => fragments.core.update());

world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) { model.useCamera(camera.three); }
  fragments.core.update(true);
});

fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({ autoSetWasm: false, wasm: { path: "/web-ifc/", absolute: true } });

// Barra de progreso
const progressBar = document.createElement("div");
progressBar.style.cssText = `position:fixed;bottom:0;left:0;width:0%;height:6px;background:#6366f1;z-index:9999;transition:width 0.2s ease;`;
document.body.append(progressBar);
const progressLabel = document.createElement("div");
progressLabel.style.cssText = `position:fixed;bottom:12px;left:50%;transform:translateX(-50%);color:white;font-size:13px;background:rgba(0,0,0,0.6);padding:4px 12px;border-radius:999px;z-index:9999;display:none;`;
document.body.append(progressLabel);
const setProgress = (v) => {
  const pct = Math.round(v * 100);
  progressBar.style.width = pct + "%";
  progressLabel.style.display = "block";
  progressLabel.textContent = `Convirtiendo IFC... ${pct}%`;
  if (pct >= 100) setTimeout(() => { progressBar.style.width = "0%"; progressLabel.style.display = "none"; }, 800);
};

// Hider
const hider = components.get(OBC.Hider);

const isolateByCategory = async (categories) => {
  const modelIdMap = {};
  const categoriesRegex = categories.map((cat) => new RegExp(`^${cat}$`));
  for (const [, model] of fragments.list) {
    const items = await model.getItemsOfCategories(categoriesRegex);
    modelIdMap[model.modelId] = new Set(Object.values(items).flat());
  }
  await hider.isolate(modelIdMap);
};

const hideByCategory = async (categories) => {
  const modelIdMap = {};
  const categoriesRegex = categories.map((cat) => new RegExp(`^${cat}$`));
  for (const [, model] of fragments.list) {
    const items = await model.getItemsOfCategories(categoriesRegex);
    modelIdMap[model.modelId] = new Set(Object.values(items).flat());
  }
  await hider.set(false, modelIdMap);
};

const resetVisibility = async () => { await hider.set(true); };

// Stats
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
const statsLabel = stats.dom.querySelector("div:last-child");
if (statsLabel) statsLabel.style.display = "none";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());

// UI
BUI.Manager.init();

// Contenedores para los dropdowns — se llenan tras cargar el modelo
const dropdownContainerA = document.createElement("div");
const dropdownContainerB = document.createElement("div");

const fillDropdowns = async () => {
  const modelCategories = new Set();
  for (const [, model] of fragments.list) {
    const categories = await model.getItemsWithGeometryCategories();
    for (const category of categories) {
      if (category) modelCategories.add(category);
    }
  }

  [dropdownContainerA, dropdownContainerB].forEach(container => {
    container.innerHTML = "";
    const dropdown = BUI.Component.create(() => {
      const options = [...modelCategories].map(cat =>
        BUI.html`<bim-option label=${cat}></bim-option>`
      );
      return BUI.html`<bim-dropdown multiple>${options}</bim-dropdown>`;
    });
    container.append(dropdown);
  });
};

const panel = BUI.Component.create(() => {
  const onLoadIfc = async ({ target }) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".ifc";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      target.loading = true; target.label = "Cargando...";
      const file = input.files[0];
      const buffer = await file.arrayBuffer();
      await ifcLoader.load(new Uint8Array(buffer), false, file.name, { processData: { progressCallback: setProgress } });
      await fillDropdowns();
      target.loading = false; target.label = "Cargar IFC";
    };
    input.click();
  };

  const onIsolateCategory = async ({ target }) => {
    const dropdown = dropdownContainerA.querySelector("bim-dropdown");
    if (!dropdown || dropdown.value.length === 0) return;
    target.loading = true;
    await isolateByCategory(dropdown.value);
    target.loading = false;
  };

  const onHideCategory = async ({ target }) => {
    const dropdown = dropdownContainerB.querySelector("bim-dropdown");
    if (!dropdown || dropdown.value.length === 0) return;
    target.loading = true;
    await hideByCategory(dropdown.value);
    target.loading = false;
  };

  const onResetVisibility = async ({ target }) => {
    target.loading = true;
    await resetVisibility();
    target.loading = false;
  };

  return BUI.html`
    <bim-panel active label="Hider Tutorial" class="options-menu">
      <bim-panel-section label="General">
        <bim-button label="Cargar IFC" @click=${onLoadIfc}></bim-button>
        <bim-button label="Reset Visibility" @click=${onResetVisibility}></bim-button>
      </bim-panel-section>
      <bim-panel-section label="Isolation">
        ${dropdownContainerA}
        <bim-button label="Isolate Category" @click=${onIsolateCategory}></bim-button>
      </bim-panel-section>
      <bim-panel-section label="Hiding">
        ${dropdownContainerB}
        <bim-button label="Hide Category" @click=${onHideCategory}></bim-button>
      </bim-panel-section>
    </bim-panel>
  `;
});

document.body.append(panel);

const button = BUI.Component.create(() => BUI.html`
  <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
    @click="${() => {
      if (panel.classList.contains("options-menu-visible")) {
        panel.classList.remove("options-menu-visible");
      } else {
        panel.classList.add("options-menu-visible");
      }
    }}">
  </bim-button>
`);

document.body.append(button);
