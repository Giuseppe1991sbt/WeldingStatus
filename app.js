let API = null;
let currentWeld = null;

const weldStatuses = [
    "Not Started",
    "Part Completed",
    "Weld Complete",
    "VT/PT Inspection Completed",
    "NDT Passed",
    "NDT Failed / Remedial Works Required",
    "Fully Complete / Closed Out"
];

const statusColours = {
    "Not Started": "#808080",
    "Part Completed": "#FFD700",
    "Weld Complete": "#2684FF",
    "VT/PT Inspection Completed": "#8E44AD",
    "NDT Passed": "#2E9D50",
    "NDT Failed / Remedial Works Required": "#D32F2F",
    "Fully Complete / Closed Out": "#006B3C"
};


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
            "Select one weld in the 3D model.";

    } catch (error) {

        showError("Connection failed", error);
    }
}


async function
