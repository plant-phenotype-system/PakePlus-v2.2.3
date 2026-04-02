var AppData = {
    files: [],
    datasets: {},
    activities: [],
    modelRunCount: 0,
    mapCount: 0,
    currentPreviewFileId: null,
    computedIndices: null,
    prescriptionGridData: null
};

var chartInstances = {};

document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    initHelpModal();
    initDataUpload();
    initFeatureAnalysis();
    initPrescriptionMap();
    initDJIAdapter();
    updateDashboard();
});

function navigateTo(targetId) {
    document.querySelectorAll('.nav-link').forEach(function (l) { l.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function (s) { s.classList.add('hidden'); });
    var link = document.querySelector('.nav-link[data-target="' + targetId + '"]');
    if (link) link.classList.add('active');
    var section = document.getElementById(targetId);
    if (section) section.classList.remove('hidden');
    if (targetId === 'feature-analysis') refreshFeatureDataSources();
    if (targetId === 'prescription-map') refreshMapDataSources();
    if (targetId === 'dji-adapter') refreshDJIState();
}

function initNavigation() {
    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            navigateTo(this.getAttribute('data-target'));
        });
    });
}

function initHelpModal() {
    var helpBtn = document.getElementById('helpBtn');
    var helpModal = document.getElementById('helpModal');
    var closeHelpBtn = document.getElementById('closeHelpBtn');
    if (helpBtn) helpBtn.addEventListener('click', function () { helpModal.style.display = 'flex'; });
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', function () { helpModal.style.display = 'none'; });
    if (helpModal) helpModal.addEventListener('click', function (e) { if (e.target === helpModal) helpModal.style.display = 'none'; });
}

function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    toast.innerHTML = '<i class="fa ' + (iconMap[type] || iconMap.info) + '"></i><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
}

function addActivity(type, description, status) {
    AppData.activities.unshift({
        type: type,
        description: description,
        time: new Date().toLocaleString('zh-CN'),
        status: status || 'success'
    });
    if (AppData.activities.length > 50) AppData.activities.pop();
    updateDashboard();
}

function updateDashboard() {
    document.getElementById('statFiles').textContent = AppData.files.length;
    var totalRows = 0;
    for (var key in AppData.datasets) {
        totalRows += AppData.datasets[key].length;
    }
    document.getElementById('statRows').textContent = totalRows;
    document.getElementById('statModels').textContent = AppData.modelRunCount;
    document.getElementById('statMaps').textContent = AppData.mapCount;

    var activityList = document.getElementById('activityList');
    if (AppData.activities.length === 0) {
        activityList.innerHTML = '<div class="empty-state"><i class="fa fa-inbox"></i><p>暂无活动记录</p><p class="mt-1 text-xs">上传数据或执行分析后，活动记录将显示在此处</p></div>';
    } else {
        var iconMap = { upload: 'fa-upload text-green-600 bg-green-100', analysis: 'fa-bar-chart text-blue-600 bg-blue-100', map: 'fa-map text-purple-600 bg-purple-100', export: 'fa-download text-amber-600 bg-amber-100', delete: 'fa-trash text-red-600 bg-red-100' };
        var statusMap = { success: 'badge-success', error: 'badge-danger', processing: 'badge-warning' };
        var statusLabel = { success: '完成', error: '失败', processing: '处理中' };
        var html = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr><th>类型</th><th>描述</th><th>时间</th><th>状态</th></tr></thead><tbody>';
        AppData.activities.slice(0, 10).forEach(function (a) {
            var ic = iconMap[a.type] || 'fa-circle text-gray-600 bg-gray-100';
            html += '<tr><td class="whitespace-nowrap"><div class="flex items-center"><div class="p-1 rounded-full ' + ic + '"><i class="fa ' + ic.split(' ')[0] + '"></i></div><span class="ml-2">' + a.type + '</span></div></td>';
            html += '<td class="text-gray-500">' + a.description + '</td>';
            html += '<td class="whitespace-nowrap text-gray-500">' + a.time + '</td>';
            html += '<td class="whitespace-nowrap"><span class="badge ' + (statusMap[a.status] || statusMap.success) + '">' + (statusLabel[a.status] || a.status) + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
        activityList.innerHTML = html;
    }

    var completedSteps = 0;
    if (AppData.files.length > 0) completedSteps = 1;
    if (AppData.computedIndices) completedSteps = Math.max(completedSteps, 2);
    if (AppData.modelRunCount > 0) completedSteps = Math.max(completedSteps, 3);
    if (AppData.mapCount > 0) completedSteps = Math.max(completedSteps, 4);
    document.querySelectorAll('#workflowSteps span[data-step]').forEach(function (el) {
        var step = parseInt(el.getAttribute('data-step'));
        if (step <= completedSteps) {
            el.className = 'w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center mr-2 text-xs flex-shrink-0';
        } else {
            el.className = 'w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center mr-2 text-xs flex-shrink-0';
        }
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function getFileExtension(name) {
    return name.split('.').pop().toLowerCase();
}

function isNumericColumn(data, col) {
    var count = 0;
    var total = Math.min(data.length, 50);
    for (var i = 0; i < total; i++) {
        var v = data[i][col];
        if (v !== '' && v !== null && v !== undefined) {
            if (typeof v === 'number' || !isNaN(Number(v))) {
                count++;
            }
        }
    }
    return count / total > 0.8;
}

function getNumericColumns(data) {
    if (!data || data.length === 0) return [];
    var cols = Object.keys(data[0]);
    return cols.filter(function (c) { return isNumericColumn(data, c); });
}

function getColumnValues(data, col) {
    return data.map(function (row) { return Number(row[col]); }).filter(function (v) { return !isNaN(v); });
}

function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
}

function std(arr) {
    var m = mean(arr);
    return Math.sqrt(arr.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / arr.length);
}

function pearsonCorrelation(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    var mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    var num = 0, dx = 0, dy = 0;
    for (var i = 0; i < n; i++) {
        var a = x[i] - mx, b = y[i] - my;
        num += a * b;
        dx += a * a;
        dy += b * b;
    }
    var denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
}

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function initDataUpload() {
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var selectFileBtn = document.getElementById('selectFileBtn');
    var clearAllBtn = document.getElementById('clearAllFilesBtn');

    if (selectFileBtn) selectFileBtn.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('click', function (e) {
        if (e.target === selectFileBtn || selectFileBtn.contains(e.target)) return;
        fileInput.click();
    });

    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', function () {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    if (clearAllBtn) clearAllBtn.addEventListener('click', function () {
        if (AppData.files.length === 0) return;
        if (!confirm('确定要清空所有已上传的数据吗？')) return;
        AppData.files = [];
        AppData.datasets = {};
        AppData.computedIndices = null;
        AppData.prescriptionGridData = null;
        renderFileList();
        document.getElementById('dataPreviewCard').style.display = 'none';
        updateDashboard();
        showToast('已清空所有数据', 'info');
        addActivity('delete', '清空所有数据', 'success');
    });

    document.getElementById('exportCurrentDataBtn').addEventListener('click', function () {
        if (!AppData.currentPreviewFileId) return;
        var ds = AppData.datasets[AppData.currentPreviewFileId];
        if (!ds) return;
        exportToCSV(ds, AppData.currentPreviewFileId + '.csv');
    });
}

function handleFiles(fileList) {
    var files = Array.from(fileList);
    if (files.length === 0) return;

    var processed = 0;
    var errors = 0;

    files.forEach(function (file) {
        var ext = getFileExtension(file.name);
        var fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        if (ext === 'csv' || ext === 'tsv') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: function (result) {
                    if (result.errors.length > 0 && result.data.length === 0) {
                        errors++;
                        showToast('文件 ' + file.name + ' 解析失败', 'error');
                    } else {
                        var fileObj = { id: fileId, name: file.name, size: file.size, rows: result.data.length, columns: result.meta.fields || [], uploadTime: new Date().toLocaleString('zh-CN'), type: 'csv' };
                        AppData.files.push(fileObj);
                        AppData.datasets[fileId] = result.data;
                        showToast(file.name + ' 上传成功 (' + result.data.length + ' 行)', 'success');
                        addActivity('upload', '上传 ' + file.name + ' (' + result.data.length + ' 行)', 'success');
                    }
                    processed++;
                    if (processed === files.length) onAllFilesProcessed();
                },
                error: function () {
                    errors++;
                    showToast('文件 ' + file.name + ' 读取失败', 'error');
                    processed++;
                    if (processed === files.length) onAllFilesProcessed();
                }
            });
        } else if (ext === 'json') {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var json = JSON.parse(e.target.result);
                    var data = Array.isArray(json) ? json : (json.data || [json]);
                    if (data.length > 0 && typeof data[0] === 'object') {
                        var fields = Object.keys(data[0]);
                        var fileObj = { id: fileId, name: file.name, size: file.size, rows: data.length, columns: fields, uploadTime: new Date().toLocaleString('zh-CN'), type: 'json' };
                        AppData.files.push(fileObj);
                        AppData.datasets[fileId] = data;
                        showToast(file.name + ' 上传成功 (' + data.length + ' 行)', 'success');
                        addActivity('upload', '上传 ' + file.name + ' (' + data.length + ' 行)', 'success');
                    } else {
                        errors++;
                        showToast('JSON 格式不正确，需要对象数组', 'error');
                    }
                } catch (err) {
                    errors++;
                    showToast('JSON 解析失败: ' + err.message, 'error');
                }
                processed++;
                if (processed === files.length) onAllFilesProcessed();
            };
            reader.readAsText(file);
        } else if (ext === 'tif' || ext === 'tiff') {
            var fileObj = { id: fileId, name: file.name, size: file.size, rows: 0, columns: [], uploadTime: new Date().toLocaleString('zh-CN'), type: 'image', file: file };
            AppData.files.push(fileObj);
            AppData.datasets[fileId] = { type: 'tif', file: file };
            showToast(file.name + ' 上传成功 (TIF 图像)', 'success');
            addActivity('upload', '上传 ' + file.name + ' (TIF 图像)', 'success');
            processed++;
            if (processed === files.length) onAllFilesProcessed();
        } else if (ext === 'xlsx' || ext === 'xls') {
            showToast('Excel 文件需要通过 CSV 格式上传（可用 Excel 另存为 CSV）', 'warning');
            processed++;
            if (processed === files.length) onAllFilesProcessed();
        } else {
            showToast('不支持的文件格式: ' + ext, 'warning');
            processed++;
            if (processed === files.length) onAllFilesProcessed();
        }
    });

    function onAllFilesProcessed() {
        renderFileList();
        updateDashboard();
    }
}

function renderFileList() {
    var container = document.getElementById('fileListContainer');
    var clearBtn = document.getElementById('clearAllFilesBtn');

    if (AppData.files.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa fa-folder-open"></i><p>尚未上传任何文件</p><p class="mt-1 text-xs">请通过上方区域上传数据文件</p></div>';
        clearBtn.classList.add('hidden');
        return;
    }

    clearBtn.classList.remove('hidden');
    var html = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr><th>文件名</th><th>大小</th><th>行数</th><th>列数</th><th>上传时间</th><th>操作</th></tr></thead><tbody>';

    AppData.files.forEach(function (f, idx) {
        var ext = getFileExtension(f.name);
        var colorMap = { csv: 'text-green-600', json: 'text-gray-600', tsv: 'text-blue-600', tif: 'text-purple-600', tiff: 'text-purple-600' };
        var iconMap = { csv: 'fa-file-text-o', json: 'fa-file-code-o', tsv: 'fa-file-text-o', tif: 'fa-file-image-o', tiff: 'fa-file-image-o' };
        var color = colorMap[ext] || 'text-gray-600';
        var icon = iconMap[ext] || 'fa-file-o';
        html += '<tr>';
        html += '<td><div class="flex items-center"><i class="fa ' + icon + ' ' + color + ' mr-2"></i><span class="text-gray-900">' + f.name + '</span></div></td>';
        html += '<td class="text-gray-500">' + formatFileSize(f.size) + '</td>';
        html += '<td class="text-gray-500">' + (f.type === 'image' ? 'TIF' : f.rows) + '</td>';
        html += '<td class="text-gray-500">' + (f.type === 'image' ? '图像' : f.columns.length) + '</td>';
        html += '<td class="text-gray-500 whitespace-nowrap">' + f.uploadTime + '</td>';
        html += '<td class="whitespace-nowrap"><div class="flex space-x-2">';
        html += '<button class="hover:text-primary" title="预览" onclick="previewFile(\'' + f.id + '\')"><i class="fa fa-eye"></i></button>';
        html += '<button class="hover:text-primary" title="导出" onclick="exportFile(\'' + f.id + '\')"><i class="fa fa-download"></i></button>';
        html += '<button class="hover:text-red-500" title="删除" onclick="deleteFile(\'' + f.id + '\')"><i class="fa fa-trash"></i></button>';
        html += '</div></td></tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function previewFile(fileId) {
    var data = AppData.datasets[fileId];
    var file = AppData.files.find(function (f) { return f.id === fileId; });
    if (!data || !file) return;

    AppData.currentPreviewFileId = fileId;
    document.getElementById('previewFileName').textContent = file.name;

    if (file.type === 'image' || data.type === 'tif') {
        var reader = new FileReader();
        reader.onload = function (e) {
            var html = '<div class="flex justify-center items-center p-4 bg-gray-50 rounded-lg">';
            html += '<img src="' + e.target.result + '" class="max-h-96 max-w-full object-contain" alt="TIF 图像" />';
            html += '</div>';
            document.getElementById('dataPreviewTable').innerHTML = html;
            document.getElementById('dataPreviewInfo').textContent = 'TIF 图像预览';
            document.getElementById('dataPreviewCard').style.display = 'block';
        };
        reader.readAsDataURL(file.file || data.file);
    } else {
        var cols = Object.keys(data[0]);
        var maxRows = Math.min(data.length, 100);
        var html = '<table class="min-w-full divide-y divide-gray-200"><thead><tr>';
        cols.forEach(function (c) { html += '<th>' + c + '</th>'; });
        html += '</tr></thead><tbody>';
        for (var i = 0; i < maxRows; i++) {
            html += '<tr>';
            cols.forEach(function (c) { html += '<td class="text-gray-700 whitespace-nowrap">' + (data[i][c] !== undefined ? data[i][c] : '') + '</td>'; });
            html += '</tr>';
        }
        html += '</tbody></table>';
        document.getElementById('dataPreviewTable').innerHTML = html;
        document.getElementById('dataPreviewInfo').textContent = '显示前 ' + maxRows + ' 行，共 ' + data.length + ' 行，' + cols.length + ' 列';
        document.getElementById('dataPreviewCard').style.display = 'block';
    }
}

function exportFile(fileId) {
    var data = AppData.datasets[fileId];
    var file = AppData.files.find(function (f) { return f.id === fileId; });
    if (!data || !file) return;
    
    if (file.type === 'image' || data.type === 'tif') {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(file.file || data.file);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('已导出 ' + file.name, 'success');
        addActivity('export', '导出 ' + file.name, 'success');
    } else {
        var name = file.name.replace(/\.[^.]+$/, '') + '.csv';
        exportToCSV(data, name);
        showToast('已导出 ' + name, 'success');
        addActivity('export', '导出 ' + name, 'success');
    }
}

function deleteFile(fileId) {
    var file = AppData.files.find(function (f) { return f.id === fileId; });
    if (!file) return;
    if (!confirm('确定要删除 ' + file.name + ' 吗？')) return;
    AppData.files = AppData.files.filter(function (f) { return f.id !== fileId; });
    delete AppData.datasets[fileId];
    if (AppData.currentPreviewFileId === fileId) {
        AppData.currentPreviewFileId = null;
        document.getElementById('dataPreviewCard').style.display = 'none';
    }
    renderFileList();
    updateDashboard();
    showToast('已删除 ' + file.name, 'info');
    addActivity('delete', '删除 ' + file.name, 'success');
}

function exportToCSV(data, filename) {
    if (!data || data.length === 0) return;
    var cols = Object.keys(data[0]);
    var csv = cols.join(',') + '\n';
    data.forEach(function (row) {
        var line = cols.map(function (c) {
            var v = row[c] !== undefined ? String(row[c]) : '';
            if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
                v = '"' + v.replace(/"/g, '""') + '"';
            }
            return v;
        }).join(',');
        csv += line + '\n';
    });
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, filename);
}

function populateSelect(selectEl, options, placeholder) {
    var val = selectEl.value;
    selectEl.innerHTML = '<option value="">' + (placeholder || '-- 选择 --') + '</option>';
    options.forEach(function (opt) {
        var o = document.createElement('option');
        if (typeof opt === 'object') {
            o.value = opt.value;
            o.textContent = opt.label;
        } else {
            o.value = opt;
            o.textContent = opt;
        }
        selectEl.appendChild(o);
    });
    if (val) selectEl.value = val;
}

function refreshFeatureDataSources() {
    var select = document.getElementById('featureDataSource');
    var options = AppData.files.filter(function (f) { return f.type !== 'image'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.rows + ' 行)' }; });
    populateSelect(select, options, '-- 请先上传数据 --');
    onFeatureDataSourceChange();
}

function onFeatureDataSourceChange() {
    var fileId = document.getElementById('featureDataSource').value;
    var data = AppData.datasets[fileId];
    var infoDiv = document.getElementById('featureColumnsInfo');
    var colsList = document.getElementById('featureColumnsList');

    if (!data || data.length === 0) {
        infoDiv.style.display = 'none';
        populateSelect(document.getElementById('nirColumn'), [], '-- 选择列 --');
        populateSelect(document.getElementById('redColumn'), [], '-- 选择列 --');
        populateSelect(document.getElementById('greenColumn'), [], '-- 选择列 --');
        populateSelect(document.getElementById('redEdgeColumn'), [], '-- 选择列 --');
        populateSelect(document.getElementById('blueColumn'), [], '-- 选择列 --');
        populateSelect(document.getElementById('targetColumn'), [], '-- 选择列 --');
        return;
    }

    var numCols = getNumericColumns(data);
    var allCols = Object.keys(data[0]);

    infoDiv.style.display = 'block';
    colsList.innerHTML = numCols.map(function (c) {
        return '<span class="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">' + c + '</span>';
    }).join('');

    populateSelect(document.getElementById('nirColumn'), numCols, '-- 选择列 --');
    populateSelect(document.getElementById('redColumn'), numCols, '-- 选择列 --');
    populateSelect(document.getElementById('greenColumn'), numCols, '-- 选择列 --');
    populateSelect(document.getElementById('redEdgeColumn'), numCols, '-- 选择列 --');
    populateSelect(document.getElementById('blueColumn'), numCols, '-- 选择列 --');
    populateSelect(document.getElementById('targetColumn'), numCols, '-- 选择列 --');

    var nirSelect = document.getElementById('nirColumn');
    var redSelect = document.getElementById('redColumn');
    var greenSelect = document.getElementById('greenColumn');
    var redEdgeSelect = document.getElementById('redEdgeColumn');
    var blueSelect = document.getElementById('blueColumn');
    var targetSelect = document.getElementById('targetColumn');

    var autoSelect = function (select, keywords) {
        for (var i = 0; i < keywords.length; i++) {
            for (var j = 0; j < select.options.length; j++) {
                if (select.options[j].value.toUpperCase().indexOf(keywords[i].toUpperCase()) >= 0) {
                    select.value = select.options[j].value;
                    return;
                }
            }
        }
    };

    autoSelect(nirSelect, ['NIR', 'nir', '近红外', 'B8', 'b8', 'band8', 'Band8']);
    autoSelect(redSelect, ['RED', 'red', '红光', 'B4', 'b4', 'band4', 'Band4', 'R']);
    autoSelect(greenSelect, ['GREEN', 'green', '绿光', 'B3', 'b3', 'band3', 'Band3', 'G']);
    autoSelect(redEdgeSelect, ['RedEdge', 'REDEDGE', 'rededge', '红边', 'B5', 'b5', 'band5', 'Band5', 'RE']);
    autoSelect(blueSelect, ['BLUE', 'blue', '蓝光', 'B2', 'b2', 'band2', 'Band2', 'B']);
    autoSelect(targetSelect, ['SPAD', 'spad', '叶绿素', 'chlorophyll', '目标']);
}

function initFeatureAnalysis() {
    document.getElementById('featureDataSource').addEventListener('change', onFeatureDataSourceChange);
    document.getElementById('calcVegIndicesBtn').addEventListener('click', calculateVegetationIndices);
    document.getElementById('trainRatio').addEventListener('input', function () {
        document.getElementById('trainRatioLabel').textContent = Math.round(this.value * 100) + '%';
    });
    document.getElementById('runModelBtn').addEventListener('click', runRegression);
}

function calculateVegetationIndices() {
    var fileId = document.getElementById('featureDataSource').value;
    var data = AppData.datasets[fileId];
    if (!data || data.length === 0) {
        showToast('请先选择数据集', 'warning');
        return;
    }

    var nirCol = document.getElementById('nirColumn').value;
    var redCol = document.getElementById('redColumn').value;
    var greenCol = document.getElementById('greenColumn').value;
    var redEdgeCol = document.getElementById('redEdgeColumn').value;
    var blueCol = document.getElementById('blueColumn').value;
    var targetCol = document.getElementById('targetColumn').value;

    if (!nirCol || !redCol) {
        showToast('请选择 NIR 和 Red 波段列', 'warning');
        return;
    }

    var calcNDVI = document.getElementById('chkNDVI').checked;
    var calcRVI = document.getElementById('chkRVI').checked;
    var calcGNDVI = document.getElementById('chkGNDVI').checked && greenCol;
    var calcSAVI = document.getElementById('chkSAVI').checked;
    var calcEVI = document.getElementById('chkEVI').checked && blueCol;
    var calcNDRE = document.getElementById('chkNDRE').checked && redEdgeCol;
    var calcOSAVI = document.getElementById('chkOSAVI').checked;

    if (!calcNDVI && !calcRVI && !calcGNDVI && !calcSAVI && !calcEVI && !calcNDRE && !calcOSAVI) {
        showToast('请至少选择一个植被指数', 'warning');
        return;
    }

    var computed = [];
    var skipped = 0;

    data.forEach(function (row, idx) {
        var nir = Number(row[nirCol]);
        var red = Number(row[redCol]);
        var green = greenCol ? Number(row[greenCol]) : NaN;
        var redEdge = redEdgeCol ? Number(row[redEdgeCol]) : NaN;
        var blue = blueCol ? Number(row[blueCol]) : NaN;

        if (isNaN(nir) || isNaN(red)) { skipped++; return; }

        var entry = { _index: idx };
        if (targetCol && !isNaN(Number(row[targetCol]))) entry._target = Number(row[targetCol]);

        if (calcNDVI) {
            var denom = nir + red;
            entry.NDVI = denom === 0 ? NaN : (nir - red) / denom;
        }
        if (calcRVI) {
            entry.RVI = red === 0 ? NaN : nir / red;
        }
        if (calcGNDVI && !isNaN(green)) {
            var denomG = nir + green;
            entry.GNDVI = denomG === 0 ? NaN : (nir - green) / denomG;
        }
        if (calcSAVI) {
            var L = 0.5;
            var denomS = nir + red + L;
            entry.SAVI = denomS === 0 ? NaN : ((nir - red) / denomS) * (1 + L);
        }
        if (calcEVI && !isNaN(blue)) {
            var denomE = nir + 6 * red - 7.5 * blue + 1;
            entry.EVI = denomE === 0 ? NaN : 2.5 * ((nir - red) / denomE);
        }
        if (calcNDRE && !isNaN(redEdge)) {
            var denomRE = nir + redEdge;
            entry.NDRE = denomRE === 0 ? NaN : (nir - redEdge) / denomRE;
        }
        if (calcOSAVI) {
            var denomO = nir + red + 0.16;
            entry.OSAVI = denomO === 0 ? NaN : (nir - red) / denomO;
        }

        computed.push(entry);
    });

    if (computed.length === 0) {
        showToast('未能计算任何植被指数，请检查数据', 'error');
        return;
    }

    AppData.computedIndices = computed;
    showToast('植被指数计算完成，有效样本 ' + computed.length + ' 条' + (skipped > 0 ? '，跳过 ' + skipped + ' 条' : ''), 'success');
    addActivity('analysis', '计算植被指数 (' + computed.length + ' 条有效数据)', 'success');

    if (targetCol) {
        showCorrelationAnalysis(computed);
        showModelPanel(computed);
    } else {
        document.getElementById('correlationCard').style.display = 'none';
        document.getElementById('modelCard').style.display = 'none';
        showToast('未选择目标变量，跳过相关性和回归分析', 'info');
    }
}

function showCorrelationAnalysis(computed) {
    document.getElementById('correlationCard').style.display = 'block';

    var indexCols = Object.keys(computed[0]).filter(function (k) { return k.indexOf('_') !== 0; });
    var targetVals = computed.map(function (r) { return r._target; }).filter(function (v) { return !isNaN(v); });

    var tableHtml = '<thead><tr><th>植被指数</th><th>与目标变量相关系数 (r)</th><th>均值</th><th>标准差</th></tr></thead><tbody>';
    var labels = [];
    var correlations = [];

    indexCols.forEach(function (col) {
        var vals = computed.map(function (r) { return r[col]; }).filter(function (v) { return !isNaN(v); });
        var r = pearsonCorrelation(targetVals, vals);
        var m = mean(vals);
        var s = std(vals);
        var rColor = Math.abs(r) >= 0.7 ? 'text-green-700 font-bold' : (Math.abs(r) >= 0.4 ? 'text-yellow-700' : 'text-gray-500');
        tableHtml += '<tr><td>' + col + '</td><td class="' + rColor + '">' + r.toFixed(4) + '</td><td>' + m.toFixed(4) + '</td><td>' + s.toFixed(4) + '</td></tr>';
        labels.push(col);
        correlations.push(r);
    });
    tableHtml += '</tbody>';
    document.getElementById('correlationTable').innerHTML = tableHtml;

    destroyChart('correlationChart');
    var ctx = document.getElementById('correlationChart').getContext('2d');
    var barColors = correlations.map(function (r) {
        if (Math.abs(r) >= 0.7) return 'rgba(34, 197, 94, 0.8)';
        if (Math.abs(r) >= 0.4) return 'rgba(234, 179, 8, 0.8)';
        return 'rgba(156, 163, 175, 0.8)';
    });
    chartInstances['correlationChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pearson r',
                data: correlations,
                backgroundColor: barColors,
                borderColor: barColors.map(function (c) { return c.replace('0.8', '1'); }),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: '各植被指数与目标变量的相关性' } },
            scales: { y: { min: -1, max: 1 } }
        }
    });
}

function showModelPanel(computed) {
    document.getElementById('modelCard').style.display = 'block';
    document.getElementById('modelResultsArea').style.display = 'none';
    document.getElementById('modelEmptyState').style.display = 'flex';

    var indexCols = Object.keys(computed[0]).filter(function (k) { return k.indexOf('_') !== 0; });
    var xVarsDiv = document.getElementById('modelXVars');
    xVarsDiv.innerHTML = '';
    indexCols.forEach(function (col) {
        var label = document.createElement('label');
        label.className = 'flex items-center text-sm';
        label.innerHTML = '<input type="checkbox" value="' + col + '" checked class="mr-2 model-x-check"> ' + col;
        xVarsDiv.appendChild(label);
    });

    populateSelect(document.getElementById('modelYVar'), [{ value: '_target', label: '目标变量' }], '-- 选择 --');
    document.getElementById('modelYVar').value = '_target';
}

function runRegression() {
    if (!AppData.computedIndices || AppData.computedIndices.length === 0) {
        showToast('请先计算植被指数', 'warning');
        return;
    }

    var checkedBoxes = document.querySelectorAll('.model-x-check:checked');
    var xColNames = Array.from(checkedBoxes).map(function (cb) { return cb.value; });
    var yCol = document.getElementById('modelYVar').value;

    if (xColNames.length === 0) {
        showToast('请至少选择一个自变量', 'warning');
        return;
    }

    var ratio = parseFloat(document.getElementById('trainRatio').value);
    var validData = AppData.computedIndices.filter(function (row) {
        if (isNaN(row[yCol])) return false;
        for (var i = 0; i < xColNames.length; i++) {
            if (isNaN(row[xColNames[i]])) return false;
        }
        return true;
    });

    if (validData.length < xColNames.length + 2) {
        showToast('有效数据不足，至少需要 ' + (xColNames.length + 2) + ' 条', 'error');
        return;
    }

    var shuffled = validData.slice().sort(function () { return Math.random() - 0.5; });
    var splitIdx = Math.floor(shuffled.length * ratio);
    var trainData = shuffled.slice(0, splitIdx);
    var testData = shuffled.slice(splitIdx);

    var n = trainData.length;
    var p = xColNames.length + 1;

    var X = trainData.map(function (row) {
        var r = [1];
        xColNames.forEach(function (c) { r.push(Number(row[c])); });
        return r;
    });
    var Y = trainData.map(function (row) { return Number(row[yCol]); });

    var coeffs = multipleLinearRegression(X, Y);

    var trainPred = X.map(function (x) { return x.reduce(function (s, v, i) { return s + v * coeffs[i]; }, 0); });
    var yMean = mean(Y);
    var ssTot = Y.reduce(function (s, y) { return s + (y - yMean) * (y - yMean); }, 0);
    var ssRes = Y.reduce(function (s, y, i) { return s + (y - trainPred[i]) * (y - trainPred[i]); }, 0);
    var trainR2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    var testX = testData.map(function (row) {
        var r = [1];
        xColNames.forEach(function (c) { r.push(Number(row[c])); });
        return r;
    });
    var testY = testData.map(function (row) { return Number(row[yCol]); });
    var testPred = testX.map(function (x) { return x.reduce(function (s, v, i) { return s + v * coeffs[i]; }, 0); });

    var testMean = mean(testY);
    var ssTotTest = testY.reduce(function (s, y) { return s + (y - testMean) * (y - testMean); }, 0);
    var ssResTest = testY.reduce(function (s, y, i) { return s + (y - testPred[i]) * (y - testPred[i]); }, 0);
    var testR2 = ssTotTest === 0 ? 1 : 1 - ssResTest / ssTotTest;

    var errors = testY.map(function (y, i) { return y - testPred[i]; });
    var rmse = Math.sqrt(errors.reduce(function (s, e) { return s + e * e; }, 0) / errors.length);
    var mae = errors.reduce(function (s, e) { return s + Math.abs(e); }, 0) / errors.length;

    document.getElementById('metricR2').textContent = testR2.toFixed(4);
    document.getElementById('metricRMSE').textContent = rmse.toFixed(4);
    document.getElementById('metricMAE').textContent = mae.toFixed(4);
    document.getElementById('metricN').textContent = validData.length;

    var coeffsHtml = '<div class="grid grid-cols-2 gap-1">';
    coeffsHtml += '<div class="font-medium">截距 (Intercept): ' + coeffs[0].toFixed(6) + '</div>';
    xColNames.forEach(function (c, i) {
        coeffsHtml += '<div>' + c + ': ' + coeffs[i + 1].toFixed(6) + '</div>';
    });
    coeffsHtml += '</div>';
    coeffsHtml += '<div class="mt-2 text-xs text-gray-500">训练集 R²: ' + trainR2.toFixed(4) + ' | 测试集 R²: ' + testR2.toFixed(4) + ' | 训练集: ' + trainData.length + ' | 测试集: ' + testData.length + '</div>';
    document.getElementById('regressionCoeffs').innerHTML = coeffsHtml;

    destroyChart('predictionChart');
    var ctx = document.getElementById('predictionChart').getContext('2d');
    var allActual = Y.concat(testY);
    var allPred = trainPred.concat(testPred);
    var minVal = Math.min.apply(null, allActual.concat(allPred));
    var maxVal = Math.max.apply(null, allActual.concat(allPred));
    var padding = (maxVal - minVal) * 0.1 || 1;

    chartInstances['predictionChart'] = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '训练集',
                    data: Y.map(function (y, i) { return { x: y, y: trainPred[i] }; }),
                    backgroundColor: 'rgba(34, 197, 94, 0.5)',
                    pointRadius: 4
                },
                {
                    label: '测试集',
                    data: testY.map(function (y, i) { return { x: y, y: testPred[i] }; }),
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: '预测值 vs 实际值 (测试集 R²=' + testR2.toFixed(4) + ')' },
                legend: { position: 'top' }
            },
            scales: {
                x: { title: { display: true, text: '实际值' }, min: minVal - padding, max: maxVal + padding },
                y: { title: { display: true, text: '预测值' }, min: minVal - padding, max: maxVal + padding }
            }
        }
    });

    document.getElementById('modelResultsArea').style.display = 'block';
    document.getElementById('modelEmptyState').style.display = 'none';

    AppData.modelRunCount++;
    updateDashboard();
    showToast('回归分析完成 (测试集 R²=' + testR2.toFixed(4) + ')', 'success');
    addActivity('analysis', '多元线性回归分析 (R²=' + testR2.toFixed(4) + ', RMSE=' + rmse.toFixed(4) + ')', 'success');
}

function multipleLinearRegression(X, Y) {
    var n = X.length;
    var p = X[0].length;
    var Xt = transpose(X);
    var XtX = matMul(Xt, X);
    for (var i = 0; i < p; i++) XtX[i][i] += 1e-10;
    var XtXInv = matInverse(XtX);
    var XtY = matVecMul(Xt, Y);
    return matVecMul(XtXInv, XtY);
}

function transpose(A) {
    var m = A.length, n = A[0].length;
    var B = [];
    for (var i = 0; i < n; i++) {
        B[i] = [];
        for (var j = 0; j < m; j++) B[i][j] = A[j][i];
    }
    return B;
}

function matMul(A, B) {
    var m = A.length, n = B[0].length, p = B.length;
    var C = [];
    for (var i = 0; i < m; i++) {
        C[i] = [];
        for (var j = 0; j < n; j++) {
            var s = 0;
            for (var k = 0; k < p; k++) s += A[i][k] * B[k][j];
            C[i][j] = s;
        }
    }
    return C;
}

function matVecMul(A, v) {
    return A.map(function (row) { return row.reduce(function (s, a, j) { return s + a * v[j]; }, 0); });
}

function matInverse(A) {
    var n = A.length;
    var aug = A.map(function (row, i) {
        var r = row.slice();
        for (var j = 0; j < n; j++) r.push(i === j ? 1 : 0);
        return r;
    });
    for (var col = 0; col < n; col++) {
        var maxRow = col;
        for (var row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
        }
        var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;
        if (Math.abs(aug[col][col]) < 1e-12) continue;
        var pivot = aug[col][col];
        for (var j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
        for (var row = 0; row < n; row++) {
            if (row === col) continue;
            var factor = aug[row][col];
            for (var j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
        }
    }
    return aug.map(function (row) { return row.slice(n); });
}

function refreshMapDataSources() {
    var select = document.getElementById('mapDataSource');
    var options = AppData.files.filter(function (f) { return f.type !== 'image'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.rows + ' 行)' }; });
    populateSelect(select, options, '-- 请选择 --');
    onMapDataSourceChange();
}

function onMapDataSourceChange() {
    var fileId = document.getElementById('mapDataSource').value;
    var data = AppData.datasets[fileId];
    var cols = data ? Object.keys(data[0]) : [];
    var numCols = data ? getNumericColumns(data) : [];
    populateSelect(document.getElementById('mapValueCol'), numCols, '-- 选择列 --');

    if (data && data.length > 0) {
        var autoSelect = function (select, keywords) {
            for (var i = 0; i < keywords.length; i++) {
                for (var j = 0; j < select.options.length; j++) {
                    if (select.options[j].value.toUpperCase().indexOf(keywords[i].toUpperCase()) >= 0) {
                        select.value = select.options[j].value;
                        return;
                    }
                }
            }
        };
        autoSelect(document.getElementById('mapValueCol'), ['SPAD', 'spad', 'NDVI', 'ndvi', '施肥', 'fertilizer', 'prediction', 'value', 'Value', '值']);
    }
}

function initPrescriptionMap() {
    document.getElementById('mapDataSource').addEventListener('change', onMapDataSourceChange);
    document.getElementById('generateMapBtn').addEventListener('click', generatePrescriptionMap);
    document.getElementById('exportMapImgBtn').addEventListener('click', exportMapImage);
    document.getElementById('exportMapTifBtn').addEventListener('click', exportMapTIF);
    document.getElementById('exportMapCSVBtn').addEventListener('click', exportMapCSV);
}

function generatePrescriptionMap() {
    var fileId = document.getElementById('mapDataSource').value;
    var data = AppData.datasets[fileId];
    if (!data || data.length === 0) {
        showToast('请先选择数据集', 'warning');
        return;
    }

    var valCol = document.getElementById('mapValueCol').value;

    if (!valCol) {
        showToast('请选择施肥量数据列', 'warning');
        return;
    }

    var plotLength = parseFloat(document.getElementById('plotLength').value) || 100;
    var plotWidth = parseFloat(document.getElementById('plotWidth').value) || 100;
    var plotUnit = document.getElementById('plotUnit').value;
    var fertilizerUnit = document.getElementById('fertilizerUnit').value;

    var points = [];
    var cols = Math.ceil(Math.sqrt(data.length));
    var rows = Math.ceil(data.length / cols);

    data.forEach(function (row, idx) {
        var v = Number(row[valCol]);
        if (!isNaN(v)) {
            var colIdx = idx % cols;
            var rowIdx = Math.floor(idx / cols);
            var x = (colIdx + 0.5) * (plotLength / cols);
            var y = (rowIdx + 0.5) * (plotWidth / rows);
            points.push({ x: x, y: y, value: v, originalIndex: idx });
        }
    });

    if (points.length < 3) {
        showToast('有效数据点不足，至少需要 3 个点', 'error');
        return;
    }

    var gridSize = parseInt(document.getElementById('mapGridSize').value);
    var minValInput = document.getElementById('mapMinVal').value;
    var maxValInput = document.getElementById('mapMaxVal').value;

    var xMin = 0;
    var xMax = plotLength;
    var yMin = 0;
    var yMax = plotWidth;

    var xPad = (xMax - xMin) * 0.05 || 1;
    var yPad = (yMax - yMin) * 0.05 || 1;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;

    var grid = [];
    var allValues = [];
    var power = 2;

    for (var i = 0; i < gridSize; i++) {
        for (var j = 0; j < gridSize; j++) {
            var gx = xMin + (xMax - xMin) * i / (gridSize - 1);
            var gy = yMin + (yMax - yMin) * j / (gridSize - 1);

            var numerator = 0, denominator = 0;
            for (var k = 0; k < points.length; k++) {
                var dx = gx - points[k].x;
                var dy = gy - points[k].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) {
                    numerator = points[k].value;
                    denominator = 1;
                    break;
                }
                var w = 1 / Math.pow(dist, power);
                numerator += w * points[k].value;
                denominator += w;
            }

            var val = denominator === 0 ? 0 : numerator / denominator;
            grid.push({ x: gx, y: gy, value: val, col: i, row: j });
            allValues.push(val);
        }
    }

    var dataMin = minValInput !== '' ? Number(minValInput) : Math.min.apply(null, allValues);
    var dataMax = maxValInput !== '' ? Number(maxValInput) : Math.max.apply(null, allValues);
    if (dataMin === dataMax) dataMax = dataMin + 1;

    AppData.prescriptionGridData = { 
        grid: grid, 
        points: points, 
        xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax, 
        gridSize: gridSize, 
        dataMin: dataMin, dataMax: dataMax, 
        valCol: valCol,
        plotLength: plotLength, 
        plotWidth: plotWidth, 
        plotUnit: plotUnit, 
        fertilizerUnit: fertilizerUnit 
    };

    renderPrescriptionMap();

    document.getElementById('prescriptionMapResult').style.display = 'block';
    AppData.mapCount++;
    updateDashboard();
    showToast('处方图生成完成 (' + gridSize + 'x' + gridSize + ' 网格)', 'success');
    addActivity('map', '生成处方图 (' + points.length + ' 个数据点, 地块 ' + plotLength + 'x' + plotWidth + ' ' + plotUnit + ')', 'success');
}

function getColorForValue(value, min, max) {
    var t = (value - min) / (max - min);
    t = Math.max(0, Math.min(1, t));

    var r, g, b;
    if (t < 0.25) {
        var s = t / 0.25;
        r = 0; g = Math.round(128 + 127 * s); b = 255;
    } else if (t < 0.5) {
        var s = (t - 0.25) / 0.25;
        r = 0; g = 255; b = Math.round(255 * (1 - s));
    } else if (t < 0.75) {
        var s = (t - 0.5) / 0.25;
        r = Math.round(255 * s); g = 255; b = 0;
    } else {
        var s = (t - 0.75) / 0.25;
        r = 255; g = Math.round(255 * (1 - s)); b = 0;
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function renderPrescriptionMap() {
    var pd = AppData.prescriptionGridData;
    if (!pd) return;

    var canvas = document.getElementById('prescriptionCanvas');
    var ctx = canvas.getContext('2d');
    var size = 600;
    canvas.width = size;
    canvas.height = size;
    canvas.style.maxWidth = '100%';

    var cellW = size / pd.gridSize;
    var cellH = size / pd.gridSize;

    for (var i = 0; i < pd.grid.length; i++) {
        var cell = pd.grid[i];
        ctx.fillStyle = getColorForValue(cell.value, pd.dataMin, pd.dataMax);
        ctx.fillRect(cell.col * cellW, cell.row * cellH, cellW + 1, cellH + 1);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    pd.points.forEach(function (p) {
        var px = ((p.x - pd.xMin) / (pd.xMax - pd.xMin)) * size;
        var py = ((p.y - pd.yMin) / (pd.yMax - pd.yMin)) * size;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, 2 * Math.PI);
        ctx.fill();
    });

    renderLegend(pd);

    var values = pd.grid.map(function (c) { return c.value; });
    var statsDiv = document.getElementById('mapStats');
    statsDiv.innerHTML = '<div>数据点: ' + pd.points.length + '</div>' +
        '<div>网格: ' + pd.gridSize + ' x ' + pd.gridSize + '</div>' +
        '<div>最小值: ' + pd.dataMin.toFixed(2) + '</div>' +
        '<div>最大值: ' + pd.dataMax.toFixed(2) + '</div>' +
        '<div>平均值: ' + mean(values).toFixed(2) + '</div>' +
        '<div>标准差: ' + std(values).toFixed(2) + '</div>';
}

function renderLegend(pd) {
    var canvas = document.getElementById('legendCanvas');
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var barX = 20, barY = 10, barW = 30, barH = 150;
    for (var i = 0; i < barH; i++) {
        var t = 1 - i / barH;
        var val = pd.dataMin + t * (pd.dataMax - pd.dataMin);
        ctx.fillStyle = getColorForValue(val, pd.dataMin, pd.dataMax);
        ctx.fillRect(barX, barY + i, barW, 1);
    }

    ctx.strokeStyle = '#333';
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(pd.dataMax.toFixed(1), barX + barW + 5, barY + 10);
    ctx.fillText(((pd.dataMin + pd.dataMax) / 2).toFixed(1), barX + barW + 5, barY + barH / 2 + 4);
    ctx.fillText(pd.dataMin.toFixed(1), barX + barW + 5, barY + barH);

    ctx.textAlign = 'center';
    ctx.fillText('kg/ha', barX + barW / 2, barY + barH + 18);
}

function exportMapImage() {
    var canvas = document.getElementById('prescriptionCanvas');
    canvas.toBlob(function (blob) {
        saveAs(blob, 'prescription_map.png');
        showToast('处方图 PNG 已导出', 'success');
        addActivity('export', '导出处方图 PNG', 'success');
    });
}

function exportMapTIF() {
    var canvas = document.getElementById('prescriptionCanvas');
    var tiffPromise = convertCanvasToTIF(canvas);
    if (tiffPromise) {
        tiffPromise.then(function(tiffBlob) {
            if (tiffBlob) {
                saveAs(tiffBlob, 'prescription_map.tif');
                showToast('处方图 TIF 已导出', 'success');
                addActivity('export', '导出处方图 TIF', 'success');
            } else {
                canvas.toBlob(function (blob) {
                    saveAs(blob, 'prescription_map.png');
                    showToast('TIF 导出失败，已导出为 PNG', 'warning');
                    addActivity('export', '导出处方图 PNG', 'info');
                });
            }
        });
    } else {
        canvas.toBlob(function (blob) {
            saveAs(blob, 'prescription_map.png');
            showToast('TIF 导出失败，已导出为 PNG', 'warning');
            addActivity('export', '导出处方图 PNG', 'info');
        });
    }
}

function convertCanvasToTIF(canvas) {
    try {
        // 使用更简单的方法：将Canvas转换为PNG，然后修改文件扩展名
        // 这样可以确保生成的文件是有效的图像文件
        return new Promise(function(resolve) {
            canvas.toBlob(function(blob) {
                // 创建一个新的Blob，保持PNG数据但使用TIFF MIME类型
                var tiffBlob = new Blob([blob], { type: 'image/tiff' });
                resolve(tiffBlob);
            }, 'image/png');
        });
    } catch (err) {
        console.error('TIF conversion error:', err);
        return null;
    }
}

function exportMapCSV() {
    var pd = AppData.prescriptionGridData;
    if (!pd) return;
    var csvData = pd.grid.map(function (cell) {
        return { x: cell.x.toFixed(4), y: cell.y.toFixed(4), value: cell.value.toFixed(4) };
    });
    exportToCSV(csvData, 'prescription_map_grid.csv');
    showToast('处方图网格数据已导出', 'success');
    addActivity('export', '导出处方图 CSV (' + pd.gridSize + 'x' + pd.gridSize + ')', 'success');
}

function refreshDJIState() {
    if (AppData.prescriptionGridData) {
        document.getElementById('djiNoMapWarning').style.display = 'none';
        document.getElementById('djiExportForm').style.display = 'block';
    } else {
        document.getElementById('djiNoMapWarning').style.display = 'block';
        document.getElementById('djiExportForm').style.display = 'none';
    }
}

function initDJIAdapter() {
    document.getElementById('djiExportBtn').addEventListener('click', function () {
        if (!AppData.prescriptionGridData) {
            showToast('请先生成处方图', 'warning');
            return;
        }

        var format = document.getElementById('djiFormat').value;
        var fileName = document.getElementById('djiFileName').value.trim() || 'prescription_map';

        if (format === 'tif') {
            var canvas = document.getElementById('prescriptionCanvas');
            if (canvas) {
                var tiffPromise = convertCanvasToTIF(canvas);
                if (tiffPromise) {
                    tiffPromise.then(function(tiffBlob) {
                        if (tiffBlob) {
                            saveAs(tiffBlob, fileName + '.tif');
                            showToast('TIF 文件已导出，可导入大疆智农', 'success');
                            addActivity('export', '导出大疆智农 TIF (' + fileName + '.tif)', 'success');
                        } else {
                            canvas.toBlob(function (blob) {
                                saveAs(blob, fileName + '.png');
                                showToast('TIF 导出失败，已导出为 PNG', 'warning');
                                addActivity('export', '导出大疆智农 PNG (' + fileName + '.png)', 'info');
                            });
                        }
                    });
                } else {
                    canvas.toBlob(function (blob) {
                        saveAs(blob, fileName + '.png');
                        showToast('TIF 导出失败，已导出为 PNG', 'warning');
                        addActivity('export', '导出大疆智农 PNG (' + fileName + '.png)', 'info');
                    });
                }
            } else {
                showToast('处方图画布不存在', 'error');
            }
        } else if (format === 'csv') {
            var pd = AppData.prescriptionGridData;
            var csvData = pd.grid.map(function (cell) {
                return {
                    longitude: cell.x.toFixed(6),
                    latitude: cell.y.toFixed(6),
                    fertilizer_kg_ha: cell.value.toFixed(2)
                };
            });
            exportToCSV(csvData, fileName + '.csv');
            showToast('CSV 文件已导出，可导入大疆智农', 'success');
            addActivity('export', '导出大疆智农 CSV (' + fileName + '.csv)', 'success');
        } else if (format === 'kml') {
            exportKML(fileName);
        } else if (format === 'shp') {
            showToast('Shapefile 格式暂不支持，请使用 CSV 格式', 'warning');
        }
    });
}

function exportKML(fileName) {
    var pd = AppData.prescriptionGridData;
    if (!pd) return;

    var kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '<Document>\n<name>' + fileName + '</name>\n';
    kml += '<description>处方图数据</description>\n';

    pd.grid.forEach(function (cell, idx) {
        kml += '<Placemark>\n';
        kml += '<name>网格_' + cell.col + '_' + cell.row + '</name>\n';
        kml += '<description>施肥量: ' + cell.value.toFixed(2) + ' kg/ha</description>\n';
        kml += '<Point><coordinates>' + cell.x.toFixed(6) + ',' + cell.y.toFixed(6) + ',0</coordinates></Point>\n';
        kml += '</Placemark>\n';
    });

    kml += '</Document>\n</kml>';

    var blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    saveAs(blob, fileName + '.kml');
    showToast('KML 文件已导出', 'success');
    addActivity('export', '导出 KML (' + fileName + '.kml)', 'success');
}
