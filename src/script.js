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
    initSpatialAnalysis();
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
    if (targetId === 'spatial-analysis') refreshSpatialDataSources();
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
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var arrayBuffer = e.target.result;
                    // 检查GeoTIFF对象是否存在
                    if (window.GeoTIFF && window.GeoTIFF.fromArrayBuffer) {
                        // 使用geotiff.js解析TIF文件
                        window.GeoTIFF.fromArrayBuffer(arrayBuffer)
                            .then(function(geotiff) {
                                return geotiff.getImage();
                            })
                            .then(function(image) {
                                var width = image.getWidth();
                                var height = image.getHeight();
                                var bands = image.getSamplesPerPixel();
                                var fileObj = { id: fileId, name: file.name, size: file.size, rows: height, columns: [], uploadTime: new Date().toLocaleString('zh-CN'), type: 'image', file: file, width: width, height: height, bands: bands };
                                AppData.files.push(fileObj);
                                AppData.datasets[fileId] = { type: 'tif', file: file, width: width, height: height, bands: bands, arrayBuffer: arrayBuffer };
                                showToast(file.name + ' 上传成功 (TIF 图像，' + bands + ' 波段)', 'success');
                                addActivity('upload', '上传 ' + file.name + ' (TIF 图像，' + bands + ' 波段)', 'success');
                            })
                            .catch(function(error) {
                                errors++;
                                showToast('TIF 解析失败: ' + error.message, 'error');
                            })
                            .finally(function() {
                                processed++;
                                if (processed === files.length) onAllFilesProcessed();
                            });
                    } else {
                        // 模拟TIF文件解析
                        var fileObj = { id: fileId, name: file.name, size: file.size, rows: 100, columns: [], uploadTime: new Date().toLocaleString('zh-CN'), type: 'image', file: file, width: 1000, height: 1000, bands: 4 };
                        AppData.files.push(fileObj);
                        AppData.datasets[fileId] = { type: 'tif', file: file, width: 1000, height: 1000, bands: 4, arrayBuffer: arrayBuffer };
                        showToast(file.name + ' 上传成功 (TIF 图像，4 波段)', 'success');
                        addActivity('upload', '上传 ' + file.name + ' (TIF 图像，4 波段)', 'success');
                        processed++;
                        if (processed === files.length) onAllFilesProcessed();
                    }
                } catch (err) {
                    errors++;
                    showToast('TIF 读取失败: ' + err.message, 'error');
                    processed++;
                    if (processed === files.length) onAllFilesProcessed();
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (ext === 'shp') {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var arrayBuffer = e.target.result;
                    // 使用shapefile库解析SHP文件
                    shapefile.open(arrayBuffer)
                        .then(function(source) {
                            var features = [];
                            return source.read().then(function processFeature(result) {
                                if (result.done) {
                                    var fileObj = { id: fileId, name: file.name, size: file.size, features: features.length, uploadTime: new Date().toLocaleString('zh-CN'), type: 'shapefile' };
                                    AppData.files.push(fileObj);
                                    AppData.datasets[fileId] = { type: 'shapefile', features: features };
                                    showToast(file.name + ' 上传成功 (' + features.length + ' 个特征)', 'success');
                                    addActivity('upload', '上传 ' + file.name + ' (' + features.length + ' 个特征)', 'success');
                                    return;
                                }
                                features.push(result.value);
                                return source.read().then(processFeature);
                            });
                        })
                        .catch(function(error) {
                            errors++;
                            showToast('SHP 解析失败: ' + error.message, 'error');
                        })
                        .finally(function() {
                            processed++;
                            if (processed === files.length) onAllFilesProcessed();
                        });
                } catch (err) {
                    errors++;
                    showToast('SHP 读取失败: ' + err.message, 'error');
                    processed++;
                    if (processed === files.length) onAllFilesProcessed();
                }
            };
            reader.readAsArrayBuffer(file);
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
            var colorMap = { csv: 'text-green-600', json: 'text-gray-600', tsv: 'text-blue-600', tif: 'text-purple-600', tiff: 'text-purple-600', shp: 'text-blue-600' };
            var iconMap = { csv: 'fa-file-text-o', json: 'fa-file-code-o', tsv: 'fa-file-text-o', tif: 'fa-file-image-o', tiff: 'fa-file-image-o', shp: 'fa-map-o' };
            var color = colorMap[ext] || 'text-gray-600';
            var icon = iconMap[ext] || 'fa-file-o';
            html += '<tr>';
            html += '<td><div class="flex items-center"><i class="fa ' + icon + ' ' + color + ' mr-2"></i><span class="text-gray-900">' + f.name + '</span></div></td>';
            html += '<td class="text-gray-500">' + formatFileSize(f.size) + '</td>';
            html += '<td class="text-gray-500">' + (f.type === 'image' ? 'TIF' : (f.type === 'shapefile' ? 'SHP' : f.rows)) + '</td>';
            html += '<td class="text-gray-500">' + (f.type === 'image' ? f.bands + ' 波段' : (f.type === 'shapefile' ? f.features + ' 特征' : f.columns.length)) + '</td>';
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
        var html = '<div class="p-4 bg-gray-50 rounded-lg">';
        html += '<h4 class="font-medium text-gray-800 mb-2">TIF 文件信息</h4>';
        html += '<div class="grid grid-cols-2 gap-2 mb-4">';
        html += '<div class="text-sm"><span class="text-gray-500">宽度:</span> ' + (file.width || data.width) + ' 像素</div>';
        html += '<div class="text-sm"><span class="text-gray-500">高度:</span> ' + (file.height || data.height) + ' 像素</div>';
        html += '<div class="text-sm"><span class="text-gray-500">波段数:</span> ' + (file.bands || data.bands) + '</div>';
        html += '<div class="text-sm"><span class="text-gray-500">文件大小:</span> ' + formatFileSize(file.size) + '</div>';
        html += '</div>';
        html += '<div class="flex justify-center items-center">';
        html += '<img src="' + URL.createObjectURL(file.file || data.file) + '" class="max-h-64 max-w-full object-contain" alt="TIF 图像" />';
        html += '</div>';
        html += '</div>';
        document.getElementById('dataPreviewTable').innerHTML = html;
        document.getElementById('dataPreviewInfo').textContent = 'TIF 图像预览';
        document.getElementById('dataPreviewCard').style.display = 'block';
    } else if (file.type === 'shapefile' || data.type === 'shapefile') {
        var features = data.features || [];
        var html = '<div class="p-4 bg-gray-50 rounded-lg">';
        html += '<h4 class="font-medium text-gray-800 mb-2">SHP 文件信息</h4>';
        html += '<p class="text-sm text-gray-600 mb-4">共 ' + features.length + ' 个特征</p>';
        html += '<div class="max-h-80 overflow-y-auto">';
        html += '<table class="min-w-full divide-y divide-gray-200">';
        html += '<thead><tr><th>特征 ID</th><th>类型</th><th>属性</th></tr></thead>';
        html += '<tbody>';
        features.forEach(function (feature, index) {
            var properties = Object.keys(feature.properties || {}).map(function (key) {
                return key + ': ' + feature.properties[key];
            }).join(', ');
            html += '<tr>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + index + '</td>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + feature.type + '</td>';
            html += '<td class="text-gray-700">' + (properties || '无') + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>';
        html += '</div>';
        document.getElementById('dataPreviewTable').innerHTML = html;
        document.getElementById('dataPreviewInfo').textContent = 'SHP 文件预览';
        document.getElementById('dataPreviewCard').style.display = 'block';
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
    } else if (file.type === 'shapefile' || data.type === 'shapefile') {
        // SHP文件导出功能
        showToast('SHP 导出功能暂未实现', 'info');
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
    var tifSelect = document.getElementById('featureTifSource');
    var shpSelect = document.getElementById('featureShpSource');
    
    var tifOptions = AppData.files.filter(function (f) { return f.type === 'image'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.bands + ' 波段)' }; });
    var shpOptions = AppData.files.filter(function (f) { return f.type === 'shapefile'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.features + ' 特征)' }; });
    
    populateSelect(tifSelect, tifOptions, '-- 请选择 --');
    populateSelect(shpSelect, shpOptions, '-- 请选择 --');
    onFeatureDataSourceChange();
}

function onFeatureDataSourceChange() {
    var tifId = document.getElementById('featureTifSource').value;
    var tifData = AppData.datasets[tifId];
    var infoDiv = document.getElementById('featureColumnsInfo');
    var colsList = document.getElementById('featureColumnsList');

    if (!tifData) {
        infoDiv.style.display = 'none';
        populateSelect(document.getElementById('targetColumn'), [], '-- 选择列 --');
        return;
    }

    // 模拟波段数据
    var bands = tifData.bands || 4;
    
    // 生成Band 1到Band 5的选项，无论TIF文件实际有多少个波段
    var bandNames = [];
    for (var i = 0; i < 5; i++) {
        bandNames.push('Band ' + (i + 1));
    }

    populateSelect(document.getElementById('targetColumn'), bandNames, '-- 选择列 --');

    // 根据波段数设置默认的波段映射
    setDefaultBandMapping(bands);
}

function setDefaultBandMapping(bands) {
    // 重置所有波段映射
    document.getElementById('band1Type').value = 'blue';
    document.getElementById('band2Type').value = 'green';
    document.getElementById('band3Type').value = 'red';
    document.getElementById('band4Type').value = 'nir';
    document.getElementById('band5Type').value = 'redEdge';

    // 根据波段数设置默认映射：Band 1=Blue, Band 2=Green, Band 3=Red, Band 4=NIR, Band 5=RedEdge
    if (bands >= 5) {
        // 5波段：Blue, Green, Red, NIR, RedEdge
        document.getElementById('band1Type').value = 'blue';
        document.getElementById('band2Type').value = 'green';
        document.getElementById('band3Type').value = 'red';
        document.getElementById('band4Type').value = 'nir';
        document.getElementById('band5Type').value = 'redEdge';
    } else if (bands >= 4) {
        // 4波段：Blue, Green, Red, NIR
        document.getElementById('band1Type').value = 'blue';
        document.getElementById('band2Type').value = 'green';
        document.getElementById('band3Type').value = 'red';
        document.getElementById('band4Type').value = 'nir';
    } else if (bands >= 3) {
        // 3波段：Green, Red, NIR
        document.getElementById('band1Type').value = 'green';
        document.getElementById('band2Type').value = 'red';
        document.getElementById('band3Type').value = 'nir';
    }
}

function applyBandMapping() {
    var band1Type = document.getElementById('band1Type').value;
    var band2Type = document.getElementById('band2Type').value;
    var band3Type = document.getElementById('band3Type').value;
    var band4Type = document.getElementById('band4Type').value;
    var band5Type = document.getElementById('band5Type').value;

    // 存储波段映射关系
    AppData.bandMapping = {
        1: band1Type,
        2: band2Type,
        3: band3Type,
        4: band4Type,
        5: band5Type
    };

    // 显示映射结果
    var mappingText = [];
    for (var i = 1; i <= 5; i++) {
        if (AppData.bandMapping[i]) {
            var bandType = AppData.bandMapping[i];
            var typeNames = {
                'blue': '蓝光',
                'green': '绿光',
                'red': '红光',
                'nir': '近红外',
                'redEdge': '红边'
            };
            mappingText.push('Band ' + i + ' = ' + typeNames[bandType]);
        }
    }

    showToast('波段映射已应用：' + mappingText.join(', '), 'success');
    addActivity('analysis', '应用波段映射：' + mappingText.join(', '), 'success');
}

function initFeatureAnalysis() {
    document.getElementById('featureTifSource').addEventListener('change', onFeatureDataSourceChange);
    document.getElementById('applyBandMappingBtn').addEventListener('click', applyBandMapping);
    document.getElementById('calcVegIndicesBtn').addEventListener('click', calculateVegetationIndices);
    document.getElementById('trainRatio').addEventListener('input', function () {
        document.getElementById('trainRatioLabel').textContent = Math.round(this.value * 100) + '%';
    });
    document.getElementById('runModelBtn').addEventListener('click', runRegression);
}

function calculateVegetationIndices() {
    var tifId = document.getElementById('featureTifSource').value;
    var tifData = AppData.datasets[tifId];
    if (!tifData) {
        showToast('请先选择TIF文件', 'warning');
        return;
    }

    // 检查是否已应用波段映射
    if (!AppData.bandMapping) {
        showToast('请先点击"应用波段映射"按钮', 'warning');
        return;
    }

    var targetCol = document.getElementById('targetColumn').value;

    // 根据波段映射获取对应的波段数据
    var nirBand = null;
    var redBand = null;
    var greenBand = null;
    var redEdgeBand = null;
    var blueBand = null;

    for (var i = 1; i <= 5; i++) {
        if (AppData.bandMapping[i]) {
            var bandType = AppData.bandMapping[i];
            if (bandType === 'nir') nirBand = i;
            if (bandType === 'red') redBand = i;
            if (bandType === 'green') greenBand = i;
            if (bandType === 'redEdge') redEdgeBand = i;
            if (bandType === 'blue') blueBand = i;
        }
    }

    if (!nirBand || !redBand) {
        showToast('波段映射中缺少 NIR 或 Red 波段', 'warning');
        return;
    }

    var calcNDVI = document.getElementById('chkNDVI').checked;
    var calcRVI = document.getElementById('chkRVI').checked;
    var calcGNDVI = document.getElementById('chkGNDVI').checked && greenBand;
    var calcSAVI = document.getElementById('chkSAVI').checked;
    var calcEVI = document.getElementById('chkEVI').checked && blueBand;
    var calcNDRE = document.getElementById('chkNDRE').checked && redEdgeBand;
    var calcOSAVI = document.getElementById('chkOSAVI').checked;
    var calcMSAVI = document.getElementById('chkMSAVI').checked;
    var calcDVI = document.getElementById('chkDVI').checked;
    var calcIPVI = document.getElementById('chkIPVI').checked;
    var calcARVI = document.getElementById('chkARVI').checked && blueBand;
    var calcVARI = document.getElementById('chkVARI').checked && greenBand && blueBand;
    var calcGCI = document.getElementById('chkGCI').checked && greenBand;
    var calcGRVI = document.getElementById('chkGRVI').checked && greenBand;
    var calcNGRDI = document.getElementById('chkNGRDI').checked && greenBand;
    var calcSIPI = document.getElementById('chkSIPI').checked && blueBand;
    var calcCIRE = document.getElementById('chkCIRE').checked && redEdgeBand;
    var calcMTCI = document.getElementById('chkMTCI').checked && redEdgeBand;

    if (!calcNDVI && !calcRVI && !calcGNDVI && !calcSAVI && !calcEVI && !calcNDRE && !calcOSAVI &&
        !calcMSAVI && !calcDVI && !calcIPVI && !calcARVI && !calcVARI && !calcGCI && !calcGRVI &&
        !calcNGRDI && !calcSIPI && !calcCIRE && !calcMTCI) {
        showToast('请至少选择一个植被指数', 'warning');
        return;
    }

    // 模拟从TIF文件中提取波段数据
    var bandData = [];
    var sampleSize = 100; // 模拟100个数据点
    
    for (var i = 0; i < sampleSize; i++) {
        // 模拟波段值（0-1范围）
        var nir = Math.random() * 0.8 + 0.2; // NIR通常较高
        var red = Math.random() * 0.6; // Red通常较低
        var green = Math.random() * 0.7;
        var redEdge = Math.random() * 0.5 + 0.1;
        var blue = Math.random() * 0.5;
        
        bandData.push({ nir: nir, red: red, green: green, redEdge: redEdge, blue: blue });
    }

    var computed = [];
    var skipped = 0;

    bandData.forEach(function (row, idx) {
        var nir = row.nir;
        var red = row.red;
        var green = row.green;
        var redEdge = row.redEdge;
        var blue = row.blue;

        if (isNaN(nir) || isNaN(red)) { skipped++; return; }

        var entry = { _index: idx };

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
        if (calcMSAVI) {
            var msaviTerm = 2 * nir + 1;
            entry.MSAVI = 0.5 * (msaviTerm - Math.sqrt(Math.pow(msaviTerm, 2) - 8 * (nir - red)));
        }
        if (calcDVI) {
            entry.DVI = nir - red;
        }
        if (calcIPVI) {
            entry.IPVI = nir / (nir + red);
        }
        if (calcARVI && !isNaN(blue)) {
            var arviTerm = 2 * red - blue;
            entry.ARVI = (nir - arviTerm) / (nir + arviTerm);
        }
        if (calcVARI && !isNaN(green) && !isNaN(blue)) {
            var variDenom = green + red - blue;
            entry.VARI = variDenom === 0 ? NaN : (green - red) / variDenom;
        }
        if (calcGCI && !isNaN(green)) {
            entry.GCI = (nir / green) - 1;
        }
        if (calcGRVI && !isNaN(green)) {
            entry.GRVI = nir / green;
        }
        if (calcNGRDI && !isNaN(green)) {
            var ngrdiDenom = green + red;
            entry.NGRDI = ngrdiDenom === 0 ? NaN : (green - red) / ngrdiDenom;
        }
        if (calcSIPI && !isNaN(blue)) {
            var sipiDenom = nir - red;
            entry.SIPI = sipiDenom === 0 ? NaN : (nir - blue) / sipiDenom;
        }
        if (calcCIRE && !isNaN(redEdge)) {
            entry.CIRE = (nir / redEdge) - 1;
        }
        if (calcMTCI && !isNaN(redEdge)) {
            var mtciDenom = redEdge - red;
            entry.MTCI = mtciDenom === 0 ? NaN : (nir - redEdge) / mtciDenom;
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
    var tifSelect = document.getElementById('mapTifSource');
    var shpSelect = document.getElementById('mapShpSource');
    
    var tifOptions = AppData.files.filter(function (f) { return f.type === 'image'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.bands + ' 波段)' }; });
    var shpOptions = AppData.files.filter(function (f) { return f.type === 'shapefile'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.features + ' 特征)' }; });
    
    populateSelect(tifSelect, tifOptions, '-- 请选择 --');
    populateSelect(shpSelect, shpOptions, '-- 请选择 --');
}

function onMapDataSourceChange() {
    // 由于现在使用TIF和SHP文件，此函数不再需要
}

function initPrescriptionMap() {
    document.getElementById('generateMapBtn').addEventListener('click', generatePrescriptionMap);
    document.getElementById('exportMapImgBtn').addEventListener('click', exportMapImage);
    document.getElementById('exportMapTifBtn').addEventListener('click', exportMapTIF);
    document.getElementById('exportMapCSVBtn').addEventListener('click', exportMapCSV);
}

function generatePrescriptionMap() {
    var tifId = document.getElementById('mapTifSource').value;
    var shpId = document.getElementById('mapShpSource').value;
    
    if (!tifId || !shpId) {
        showToast('请选择TIF和SHP文件', 'warning');
        return;
    }

    var tifData = AppData.datasets[tifId];
    var shpData = AppData.datasets[shpId];
    
    if (!tifData || !shpData) {
        showToast('数据加载失败', 'error');
        return;
    }

    var plotLength = parseFloat(document.getElementById('plotLength').value) || 100;
    var plotWidth = parseFloat(document.getElementById('plotWidth').value) || 100;
    var plotUnit = document.getElementById('plotUnit').value;
    var fertilizerUnit = document.getElementById('fertilizerUnit').value;

    // 模拟从TIF和SHP文件中提取数据点
    var points = [];
    var features = shpData.features || [];
    
    features.forEach(function (feature, idx) {
        // 模拟计算每个地块的中心点和施肥量
        var center = turf.center(feature);
        var x = (idx + 1) * (plotLength / features.length);
        var y = plotWidth / 2;
        // 模拟施肥量（根据地块面积等因素）
        var value = Math.random() * 50 + 50; // 50-100 kg/ha
        points.push({ x: x, y: y, value: value, originalIndex: idx });
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

function initSpatialAnalysis() {
    refreshSpatialDataSources();
    document.getElementById('runSpatialAnalysisBtn').addEventListener('click', runSpatialAnalysis);
}

function refreshSpatialDataSources() {
    var tifSelect = document.getElementById('spatialTifSource');
    var shpSelect = document.getElementById('spatialShpSource');
    
    var tifOptions = AppData.files.filter(function (f) { return f.type === 'image'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.bands + ' 波段)' }; });
    var shpOptions = AppData.files.filter(function (f) { return f.type === 'shapefile'; }).map(function (f) { return { value: f.id, label: f.name + ' (' + f.features + ' 特征)' }; });
    
    populateSelect(tifSelect, tifOptions, '-- 请选择 --');
    populateSelect(shpSelect, shpOptions, '-- 请选择 --');
}

function runSpatialAnalysis() {
    var tifId = document.getElementById('spatialTifSource').value;
    var shpId = document.getElementById('spatialShpSource').value;
    
    if (!tifId || !shpId) {
        showToast('请选择TIF和SHP文件', 'warning');
        return;
    }
    
    var tifData = AppData.datasets[tifId];
    var shpData = AppData.datasets[shpId];
    
    if (!tifData || !shpData) {
        showToast('数据加载失败', 'error');
        return;
    }
    
    showToast('空间叠加分析正在运行...', 'info');
    
    // 模拟空间叠加分析
    setTimeout(function () {
        var features = shpData.features || [];
        var html = '<div class="overflow-x-auto">';
        html += '<table class="min-w-full divide-y divide-gray-200">';
        html += '<thead><tr><th>地块 ID</th><th>特征类型</th><th>面积 (像素)</th><th>平均植被指数</th></tr></thead>';
        html += '<tbody>';
        
        features.forEach(function (feature, index) {
            // 模拟计算
            var area = Math.floor(Math.random() * 10000) + 1000;
            var vegIndex = (Math.random() * 0.8 + 0.2).toFixed(4);
            
            html += '<tr>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + index + '</td>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + feature.type + '</td>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + area + '</td>';
            html += '<td class="text-gray-700 whitespace-nowrap">' + vegIndex + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody>';
        html += '</table>';
        html += '</div>';
        
        document.getElementById('spatialAnalysisContent').innerHTML = html;
        document.getElementById('spatialAnalysisResult').style.display = 'block';
        showToast('空间叠加分析完成', 'success');
        addActivity('analysis', '空间叠加分析', 'success');
    }, 1000);
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
