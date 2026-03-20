import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
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
await world.camera.controls.setLookAt(65, 19, -27, 12.6, -5, -1.4);

container.addEventListener("resize", () => {
  rendererComponent.resize();
  cameraComponent.updateAspect();
});

components.init();

const grids = components.get(OBC.Grids);
grids.create(world);

// IfcLoader
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { path: "/web-ifc/", absolute: true },
});

// FragmentsManager
const githubUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", { type: "text/javascript" });
const workerUrl = URL.createObjectURL(workerFile);
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("update", () => fragments.core.update(true));

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

// Tabla de propiedades
const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
  components,
  modelIdMap: {},
});

propertiesTable.preserveStructureOnFilter = true;
propertiesTable.indentationInText = false;

// Highlighter - selección de elementos
const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({ world });

highlighter.events.select.onHighlight.add((modelIdMap) => {
  updatePropertiesTable({ modelIdMap });
});

highlighter.events.select.onClear.add(() =>
  updatePropertiesTable({ modelIdMap: {} })
);

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

// Panel de propiedades
const propertiesPanel = BUI.Component.create(() => {
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

  const onTextInput = (e) => {
    const input = e.target;
    propertiesTable.queryString = input.value !== "" ? input.value : null;
  };

  const expandTable = (e) => {
    const button = e.target;
    propertiesTable.expanded = !propertiesTable.expanded;
    button.label = propertiesTable.expanded ? "Collapse" : "Expand";
  };

  const copyAsTSV = async () => {
    await navigator.clipboard.writeText(propertiesTable.tsv);
  };

  return BUI.html`
    <bim-panel active label="Properties" class="options-menu" style="max-height: 90vh; overflow-y: auto;">
      <bim-panel-section label="Element Data">
        <bim-button label="Cargar IFC" @click=${onLoadIfc}></bim-button>
        <div style="display: flex; gap: 0.5rem;">
          <bim-button @click=${expandTable} label="Expand"></bim-button>
          <bim-button @click=${copyAsTSV} label="Copy as TSV"></bim-button>
        </div>
        <bim-text-input @input=${onTextInput} placeholder="Search Property" debounce="250"></bim-text-input>
        ${propertiesTable}
      </bim-panel-section>
    </bim-panel>
  `;
});

document.body.append(propertiesPanel);

const button = BUI.Component.create(() => {
  return BUI.html`
    <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
      @click="${() => {
        if (propertiesPanel.classList.contains("options-menu-visible")) {
          propertiesPanel.classList.remove("options-menu-visible");
        } else {
          propertiesPanel.classList.add("options-menu-visible");
        }
      }}">
    </bim-button>
  `;
});

document.body.append(button);
