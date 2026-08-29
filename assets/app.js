const GIST_URL = "https://gist.githubusercontent.com/BenceBarens/8262c049e135b17d4645a1d2d76bed09/raw/tracker-data.json";
// const GIST_URL = "../assets/testgist.json";

let allData = [];
let blameChart = null;

async function fetchData() {
    try {
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${GIST_URL}?t=${cacheBuster}`, { cache: 'no-store' });
        allData = await response.json();
        updateChart(288); 
    } catch (error) {
        console.error("Error retrieving data:", error);
    }
}

function getCombinedStatus(apiStatus, webStatus) {
    if (apiStatus !== 'operational' && apiStatus !== 'unknown') {
        return apiStatus;
    }
    if (webStatus !== 'operational' && webStatus !== 'unknown') {
        return 'web_outage';
    }
    return 'operational';
}

function getColor(status) {
    switch (status) {
        case 'degraded_performance': return 'rgba(255, 206, 86, 0.85)';
        case 'partial_outage':       return 'rgba(255, 128, 0, 0.85)';
        case 'major_outage':         return 'rgba(255, 50, 50, 0.85)';
        case 'web_outage':           return 'rgba(153, 102, 255, 0.85)';
        default:                     return 'rgba(150, 150, 150, 0.85)';
    }
}

function updateChart(dataPoints) {
    if (allData.length === 0) return;

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDarkMode ? '#e5e7eb' : '#374151';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const lineColor = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
    const defaultPointColor = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

    const timeFrameMs = dataPoints * 15 * 60 * 1000;
    const lastEntryTime = new Date(allData[allData.length - 1].timestamp).getTime();
    const cutoffTime = lastEntryTime - timeFrameMs;
    const slicedData = allData.filter(entry => new Date(entry.timestamp).getTime() >= cutoffTime);
    
    const chartData = slicedData.map(entry => ({ x: entry.timestamp, y: entry.prs }));

    const outageAnnotations = {};
    let annotationCount = 0;

    function createBanner(aiName, startX, endX, yMin, yMax, color) {
        outageAnnotations[`outage_${annotationCount++}`] = {
            type: 'box', yScaleID: 'yBanner',
            yMin, yMax, xMin: startX, xMax: endX,
            backgroundColor: color, borderWidth: 0, drawTime: 'afterDatasetsDraw',
            label: {
                display: true, content: aiName, color: 'white',
                font: { size: 16, family: 'BenceSans, cursive', weight: '400' },
                position: 'center'
            }
        };
    }

    let oai = { start: null, status: 'operational' };
    let claude = { start: null, status: 'operational' };

    slicedData.forEach((entry, index) => {
        const timestamp = new Date(entry.timestamp).getTime();
        const prevTimestamp = index > 0 ? new Date(slicedData[index - 1].timestamp).getTime() : timestamp - 900000;
        const midStart = (timestamp + prevTimestamp) / 2;

        const currentOaiStatus = getCombinedStatus(entry.openai_api, entry.openai_chatgpt);
        const currentClaudeStatus = getCombinedStatus(entry.claude_api, entry.claude_web);

        if (currentOaiStatus !== oai.status) {
            if (oai.status !== 'operational') {
                createBanner('OpenAI', oai.start, midStart, 94, 100, getColor(oai.status));
            }
            oai.start = midStart;
            oai.status = currentOaiStatus;
        }

        if (currentClaudeStatus !== claude.status) {
            if (claude.status !== 'operational') {
                createBanner('Claude', claude.start, midStart, 87, 93, getColor(claude.status));
            }
            claude.start = midStart;
            claude.status = currentClaudeStatus;
        }
    });

    const lastTimestamp = new Date(slicedData[slicedData.length - 1].timestamp).getTime() + 450000;
    if (oai.status !== 'operational' && oai.status !== 'unknown') {
        createBanner('OpenAI', oai.start, lastTimestamp, 94, 100, getColor(oai.status));
    }
    if (claude.status !== 'operational' && claude.status !== 'unknown') {
        createBanner('Claude', claude.start, lastTimestamp, 87, 93, getColor(claude.status));
    }

    if (blameChart) blameChart.destroy();

    const ctx = document.getElementById('trackerChart').getContext('2d');
    blameChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'GitHub pull requests worldwide',
                data: chartData,
                borderColor: lineColor,
                borderWidth: 2,
                pointBackgroundColor: defaultPointColor,
                pointBorderColor: defaultPointColor,
                radius: 4,
                tension: 0.4 
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                annotation: { annotations: outageAnnotations },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const entry = slicedData[context.dataIndex];
                            return [
                                `OpenAI: ${entry.openai_message}`,
                                `Claude: ${entry.claude_message}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'dd MMM HH:mm',
                        displayFormats: { minute: 'HH:mm', hour: 'HH:mm', day: 'dd MMM' }
                    },
                    title: { display: false },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: { 
                    beginAtZero: true, grace: '10%', title: { display: false },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                yBanner: { type: 'linear', display: false, min: 0, max: 100 }
            }
        }
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    slicedData.forEach(entry => {
        const dateStr = new Date(entry.timestamp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${dateStr}</td><td>${entry.prs}</td><td>${entry.openai_message}</td><td>${entry.claude_message}</td>`;
        tbody.appendChild(tr);
    });

    const timeFrame = dataPoints === 96 ? '3 days' : dataPoints === 672 ? '7 days' : '30 days';
    document.getElementById('sr-announcement').innerText = `Graph and table are updated, now showing the last ${timeFrame}.`;
}

const controlButtons = document.querySelectorAll('.controls-container button');

controlButtons.forEach(button => {
    button.addEventListener('click', function() {
        controlButtons.forEach(btn => btn.removeAttribute('aria-current'));
        this.setAttribute('aria-current', 'true');
        const points = parseInt(this.getAttribute('data-points'));
        updateChart(points);
    });
});

fetchData();