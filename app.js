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
            "Now select an object in the 3D model.";

        console.log("Connected to Trimble Connect", API);

    } catch (error) {

        statusBox.innerHTML =
            "<strong>Connection failed</strong><br>" +
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

        statusBox.innerHTML =
            "<strong>Object selected</strong><br><br>" +
            "<pre>" +
            JSON.stringify(selection, null, 2) +
            "</pre>";

    } catch (error) {

        console.error(error);

        statusBox.innerHTML =
            "<strong>Error reading selection</strong><br>" +
            error.message;
    }
}


window.addEventListener("load", startTrimbleConnection);
