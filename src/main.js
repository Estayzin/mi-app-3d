import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import Stats from "stats.js";

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.name = "main";

const sceneComponent = new OBC.SimpleScene(components);
sceneComponent.setup();
world.scene = sceneComponent;
world.scene.three.background = null;

const container = document.getElementById("container");
const rendererComponent = new OBC.SimpleRenderer(components, container);
world.renderer = rendererComponent;

const cameraComponent = new OBC.SimpleCamera(components);
world.camera = cameraComponent;

container.addEventListener("resize", () => {
  rendererComponent.resize();
  cameraComponent.updateAspect();
});

const viewerGrids = components.get(OBC.Grids);
viewerGrids.create(world);

components.init();

// IfcLoader setup
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: {
    path: "/web-ifc/",
    absolute: true,
  },
});

// FragmentsManager setup
const githubUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", { type: "text/javascript" });
const workerUrl = URL.createObjectURL(workerFile);
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("update", () => fragments.core.update());

fragments.list.onItemSet.add(async ({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  await fragments.core.update(true);
});

fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

// ModelsList y botón de carga preconstruidos
const [modelsList] = BUIC.tables.modelsList({
  components,
  metaDataTags: ["schema"],
  actions: { download: true },
});

const panel = BUI.Component.create(() => {
  const onLoadIfc = async ({ target }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      target.loading = true;
      target.label = "Cargando...";
      const file = input.files[0];
      const buffer = await file.arrayBuffer();
      await ifcLoader.load(new Uint8Array(buffer), false, file.name, {});
      target.loading = false;
      target.label = "Cargar IFC";
    };
    input.click();
  };

  return BUI.html`
    <bim-panel active label="IFC Models" class="options-menu">
      <bim-panel-section label="Importing">
        <bim-button label="Cargar IFC" @click=${onLoadIfc}></bim-button>
      </bim-panel-section>
      <bim-panel-section icon="mage:box-3d-fill" label="Loaded Models">
        ${modelsList}
      </bim-panel-section>
    </bim-panel>
  `;
});

document.body.append(panel);

const button = BUI.Component.create(() => {
  return BUI.html`
    <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
      @click="${() => {
        if (panel.classList.contains("options-menu-visible")) {
          panel.classList.remove("options-menu-visible");
        } else {
          panel.classList.add("options-menu-visible");
        }
      }}">
    </bim-button>
  `;
});

document.body.append(button);

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
