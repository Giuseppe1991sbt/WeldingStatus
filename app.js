let API = null;

async function startTrimbleConnection() {

    const statusBox = document.getElementById("status");

    try {

        statusBox.innerHTML = "Connecting to Trimble Connect...";

        API = await TrimbleConnectWorkspace.connect(
            window.parent,
            onTrimbleEvent
        );

        statusBox.innerHTML =
            "<strong>Connected to Trimble Connect</strong><br><br>" +
            "Now select a weld in the 3D model.";

    } catch (error) {

        statusBox.innerHTML =
            "<strong>Connection failed</strong><br><br>" +
            error.message;

        console.error(error);
    }
}


async function onTrimbleEvent(event, data) {

    console.log("Trimble event:", event, data);

    if (
        event === "viewer.onSelectionChanged" ||
        event === "selectionChanged"
    ) {
        await readSelectedObject();
    }
}


async function readSelectedObject() {

    const statusBox = document.getElementById("status");

    try {

        const selection = await API.viewer.getSelection();

        console.log("Selection:", selection);

        if (!selection || selection.length === 0) {

            statusBox.innerHTML = "No object selected.";
            return;
        }

        const selected = selection[0];

        const modelId = selected.modelId;
        const runtimeIds = selected.objectRuntimeIds;

        if (!runtimeIds || runtimeIds.length === 0) {

            statusBox.innerHTML = "No object selected.";
            return;
        }

        const properties =
            await API.viewer.getObjectProperties(
                modelId,
                runtimeIds
            );

        console.log("Object properties:", properties);

        const safeProperties = JSON.stringify(
            properties,
            (key, value) =>
                typeof value === "bigint"
                    ? value.toString()
                    : value,
            2
        );

        statusBox.innerHTML =
            "<strong>Weld selected</strong><br><br>" +

            "<strong>Model ID:</strong><br>" +
            modelId +
            "<br><br>" +

            "<strong>Object Properties:</strong><br>" +

            "<pre style='white-space: pre-wrap; word-break: break-word;'>" +
            safeProperties +
            "</pre>";

    } catch (error) {

        console.error(error);

        statusBox.innerHTML =
            "<strong>Error reading weld</strong><br><br>" +
            error.message;
    }
}


window.addEventListener(
    "load",
    startTrimbleConnection
);
