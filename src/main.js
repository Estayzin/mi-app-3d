import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create();

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const container = document.getElementById("container");
world.renderer = new OBF.PostproductionRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
await world.camera.controls.setLookAt(68, 23, -8.5, 21.5, -5.5, 23);

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
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
  fragments.core.update(true);
  world.renderer?.postproduction.updateCamera();
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

const fragPaths = [
  "https://thatopen.github.io/engine_components/resources/frags/school_arq.frag",
];
await Promise.all(
  fragPaths.map(async (path) => {
    const modelId = path.split("/").pop()?.split(".").shift();
    if (!modelId) return null;
    const file = await fetch(path);
    const buffer = await file.arrayBuffer();
    return fragments.core.load(buffer, { modelId });
  }),
);

// ClipStyler
const clipStyler = components.get(OBF.ClipStyler);
clipStyler.world = world;

clipStyler.styles.set("Blue", {
  linesMaterial: new LineMaterial({ color: "black", linewidth: 2 }),
  fillsMaterial: new THREE.MeshBasicMaterial({ color: "lightblue", side: 2 }),
});

clipStyler.styles.set("Red", {
  linesMaterial: new LineMaterial({ color: "black", linewidth: 3 }),
  fillsMaterial: new THREE.MeshBasicMaterial({ color: "salmon", side: 2 }),
});

clipStyler.styles.set("Green", {
  linesMaterial: new LineMaterial({ color: "black", linewidth: 2 }),
  fillsMaterial: new THREE.MeshBasicMaterial({ color: "lightgreen", side: 2 }),
});

clipStyler.styles.set("Black", {
  linesMaterial: new LineMaterial({ color: "black", linewidth: 2 }),
  fillsMaterial: new THREE.MeshBasicMaterial({ color: "black", side: 2 }),
});

clipStyler.styles.set("BlackFill", {
  fillsMaterial: new THREE.MeshBasicMaterial({ color: "black", side: 2 }),
});

// Finder y Classifier
const finder = components.get(OBC.ItemsFinder);
finder.create("Walls", [{ categories: [/WALL/] }]);
finder.create("Slabs", [{ categories: [/SLAB/] }]);
finder.create("Columns", [{ categories: [/COLUMN/] }]);
finder.create("Doors", [{ categories: [/DOOR/] }]);
finder.create("Curtains", [{ categories: [/PLATE/, /MEMBER/] }]);
finder.create("Windows", [{ categories: [/WINDOW/] }]);

const classifier = components.get(OBC.Classifier);
const classificationName = "ClipperGroups";
classifier.setGroupQuery(classificationName, "Walls", { name: "Walls" });
classifier.setGroupQuery(classificationName, "Slabs", { name: "Slabs" });
classifier.setGroupQuery(classificationName, "Columns", { name: "Columns" });
classifier.setGroupQuery(classificationName, "Doors", { name: "Doors" });
classifier.setGroupQuery(classificationName, "Curtains", { name: "Curtains" });
classifier.setGroupQuery(classificationName, "Windows", { name: "Windows" });

// Clipper
const casters = components.get(OBC.Raycasters);
casters.get(world);

const clipper = components.get(OBC.Clipper);
clipper.enabled = true;

container.ondblclick = () => {
  if (clipper.enabled) clipper.create(world);
};

window.onkeydown = (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    if (clipper.enabled) clipper.delete(world);
  }
};

clipper.list.onItemSet.add(({ key }) => {
  clipStyler.createFromClipping(key, {
    items: { All: { style: "BlackFill" } },
  });
});

clipper.createFromNormalAndCoplanarPoint(
  world,
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 4, 0),
);

// Views
const views = components.get(OBC.Views);

const sectionView = views.createFromPlane(
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), 35),
  { id: "Section", world },
);

sectionView.range = 5;
sectionView.helpersVisible = true;

clipStyler.createFromView(sectionView, {
  items: {
    ArchElements: {
      style: "Blue",
      data: { [classificationName]: ["Walls", "Slabs", "Curtains", "Windows"] },
    },
  },
});

const [planView] = await views.createFromIfcStoreys({
  storeyNames: [/03/],
  world,
  offset: 1,
});

planView.helpersVisible = true;

const planEdges = clipStyler.createFromView(planView, {
  items: {
    Walls: { style: "Blue", data: { [classificationName]: ["Walls"] } },
    Columns: { style: "Red", data: { [classificationName]: ["Columns"] } },
    Doors: { style: "Green", data: { [classificationName]: ["Doors"] } },
  },
});

planEdges.items.set("Curtains & Windows", {
  style: "Black",
  data: { [classificationName]: ["Curtains", "Windows"] },
});

const manageVisibility = () => {
  for (const [, clippingPlane] of clipper.list) {
    clippingPlane.enabled = !views.hasOpenViews;
    clippingPlane.visible = !views.hasOpenViews;
  }
  for (const [, view] of views.list) {
    view.helpersVisible = !views.hasOpenViews;
  }
};

planView.onStateChanged.add(manageVisibility);
sectionView.onStateChanged.add(manageVisibility);

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

const viewsListTemplate = (state) => {
  const { components } = state;
  const views = components.get(OBC.Views);
  const onCreated = (e) => {
    if (!e) return;
    const table = e;
    table.data = [...views.list.keys()].map((key) => ({
      data: { Name: key, Actions: "" },
    }));
  };
  return BUI.html`<bim-table ${BUI.ref(onCreated)}></bim-table>`;
};

const [viewsList] = BUI.Component.create(viewsListTemplate, { components });

viewsList.headersHidden = true;
viewsList.noIndentation = true;
viewsList.columns = ["Name", { name: "Actions", width: "auto" }];

viewsList.dataTransform = {
  Actions: (_, rowData) => {
    const { Name } = rowData;
    if (!Name) return _;
    const views = components.get(OBC.Views);
    const view = views.list.get(Name);
    if (!view) return _;
    const onOpen = () => views.open(Name);
    const onClose = () => views.close(Name);
    return BUI.html`
      <bim-button label-hidden icon="solar:cursor-bold" label="Open" @click=${onOpen}></bim-button>
      <bim-button label-hidden icon="material-symbols:close" label="Close" @click=${onClose}></bim-button>
    `;
  },
};

const stylesTable = BUI.Component.create(() => {
  const onCreated = (_table) => {
    if (!(_table instanceof BUI.Table)) return;
    const table = _table;
    table.dataTransform = {
      LineWidth: (value, rowData) => {
        const name = rowData.Name;
        const style = clipStyler.styles.get(name);
        if (!style?.linesMaterial) return value;
        const onChange = ({ target }) => { style.linesMaterial.linewidth = target.value; };
        return BUI.html`<bim-number-input .value=${value} min=0.5 max=10 slider step=0.05 @change=${onChange}></bim-number-input>`;
      },

      LineColor: (value, rowData) => {
        const name = rowData.Name;
        const style = clipStyler.styles.get(name);
        if (!style?.linesMaterial) return value;
        const onChange = ({ target }) => { style.linesMaterial.color = new THREE.Color(target.color); };
        return BUI.html`<bim-color-input .color=${value} @input=${onChange}></bim-color-input>`;
      },
      FillColor: (value, rowData) => {
        const name = rowData.Name;
        const style = clipStyler.styles.get(name);
        if (!style?.fillsMaterial) return value;
        const onChange = ({ target }) => {
          if ("color" in style.fillsMaterial && style.fillsMaterial.color instanceof THREE.Color) {
            style.fillsMaterial.color = new THREE.Color(target.color);
          }
        };
        return BUI.html`<bim-color-input .color=${value} @input=${onChange}></bim-color-input>`;
      },
    };
    table.data = Array.from(clipStyler.styles.entries()).map(([name, style]) => {
      const linesMaterial = style.linesMaterial;
      const fillsMaterial = style.fillsMaterial;
      const row = { data: { Name: name } };
      if (linesMaterial) {
        row.data.LineWidth = linesMaterial.linewidth;
        row.data.LineColor = `#${linesMaterial.color.getHexString()}`;
      }
      if (fillsMaterial) {
        row.data.FillColor = `#${fillsMaterial.color.getHexString()}`;
      }
      return row;
    });
  };
  return BUI.html`<bim-table no-indentation ${BUI.ref(onCreated)}></bim-table>`;
});

const panel = BUI.Component.create(() => {
  return BUI.html`
    <bim-panel active label="Clip Styler Tutorial" class="options-menu">
      <bim-panel-section label="Styles">
        <bim-label style="white-space: normal;">Here you can manage the clipping styles of your app. Try to change some of these while a view is open to see the effect.</bim-label>
        ${stylesTable}
      </bim-panel-section>
      <bim-panel-section label="Views">
        <bim-label style="white-space: normal;">These are the views created in the project. They are linked to the clipping styles.</bim-label>
        ${viewsList}
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
