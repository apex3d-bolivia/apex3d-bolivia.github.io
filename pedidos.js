(function () {
  'use strict';

  var USERNAME = 'apex3d';
  var PASSWORD = 'apex3d123';
  var SESSION_KEY = 'apex3d-local-session-v2';
  var DB_NAME = 'apex3d-orders-v1';
  var STATUSES = ['Planeación', 'Imprimiendo', 'Concluido', 'Entregado'];
  var columns = [
    ['productName', 'Producto'], ['fileLink', 'Enlace del archivo'], ['features', 'Características'],
    ['quantity', 'Cantidad'], ['customerName', 'Interesado'], ['customerPhone', 'Celular'],
    ['deliveryDate', 'Fecha de entrega'], ['deliveryMethod', 'Entrega'], ['printer', 'Encargado'],
    ['totalCost', 'Costo total (Bs)'], ['amountPaid', 'Pagado (Bs)'], ['balance', 'Saldo (Bs)'],
    ['observations', 'Observación'], ['status', 'Estado'], ['actions', 'Acciones']
  ];
  var orders = [];
  var editingId = null;
  var sortKey = 'deliveryDate';
  var sortDirection = 1;
  var selectedDate = toISODate(new Date());
  var calendarMonth = new Date();
  calendarMonth.setDate(1);
  var databasePromise;
  var objectUrls = [];

  function byId(id) { return document.getElementById(id); }
  function toISODate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function showFeedback(id, message) { byId(id).textContent = message; }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains('orders')) {
          request.result.createObjectStore('orders', { keyPath: 'id' });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('No se pudo abrir el almacenamiento local.')); };
      request.onblocked = function () { reject(new Error('El almacenamiento está bloqueado por otra pestaña.')); };
    });
    return databasePromise;
  }

  async function readOrders() {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var request = db.transaction('orders', 'readonly').objectStore('orders').getAll();
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('No se pudieron leer los pedidos.')); };
    });
  }

  async function saveOrder(order) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction('orders', 'readwrite');
      transaction.objectStore('orders').put(order);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error('No se pudo guardar el pedido.')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Se canceló el guardado del pedido.')); };
    });
  }

  async function removeOrder(id) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction('orders', 'readwrite');
      transaction.objectStore('orders').delete(id);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error('No se pudo eliminar el pedido.')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Se canceló la eliminación del pedido.')); };
    });
  }

  function setAuthentication(isAuthenticated) {
    byId('loginPanel').classList.toggle('hidden', isAuthenticated);
    byId('dashboard').classList.toggle('hidden', !isAuthenticated);
    byId('logoutButton').classList.toggle('hidden', !isAuthenticated);
  }

  function setActiveView(view) {
    var showCalendar = view === 'calendar';
    byId('listTab').setAttribute('aria-selected', String(!showCalendar));
    byId('listTab').tabIndex = showCalendar ? -1 : 0;
    byId('calendarTab').setAttribute('aria-selected', String(showCalendar));
    byId('calendarTab').tabIndex = showCalendar ? 0 : -1;
    byId('listView').classList.toggle('hidden', showCalendar);
    byId('listView').hidden = showCalendar;
    byId('calendarView').classList.toggle('hidden', !showCalendar);
    byId('calendarView').hidden = !showCalendar;
  }

  function createId() {
    return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function formatMoney(value) { return Number(value || 0).toFixed(2); }
  function orderBalance(order) { return Number(order.totalCost || 0) - Number(order.amountPaid || 0); }

  function clearObjectUrls() {
    objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    objectUrls = [];
  }

  function makeCell(value) {
    var cell = document.createElement('td');
    cell.textContent = value === null || value === undefined ? '' : String(value);
    return cell;
  }

  function createFileCell(order) {
    var cell = document.createElement('td');
    if (order.fileLink) {
      var link = document.createElement('a');
      link.className = 'file-link';
      link.href = order.fileLink;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Abrir archivo';
      link.setAttribute('aria-label', 'Abrir archivo de ' + order.productName + ' en una pestaña nueva');
      cell.appendChild(link);
    } else if (order.photo instanceof Blob) {
      var link = document.createElement('a');
      var url = URL.createObjectURL(order.photo);
      objectUrls.push(url);
      link.className = 'file-link';
      link.href = url;
      link.download = order.productName + '-archivo-anterior';
      link.textContent = 'Descargar imagen anterior';
      cell.appendChild(link);
    } else {
      cell.textContent = '—';
    }
    return cell;
  }

  function compareOrders(a, b) {
    var left = a[sortKey];
    var right = b[sortKey];
    if (sortKey === 'balance') { left = orderBalance(a); right = orderBalance(b); }
    if (sortKey === 'actions') return 0;
    if (typeof left === 'number' || typeof right === 'number') {
      return (Number(left || 0) - Number(right || 0)) * sortDirection;
    }
    return String(left || '').localeCompare(String(right || ''), 'es', {
      numeric: true, sensitivity: 'base'
    }) * sortDirection;
  }

  function renderTable() {
    clearObjectUrls();
    var filter = byId('statusFilter').value;
    var visibleOrders = orders.filter(function (order) {
      return !filter || order.status === filter;
    }).slice().sort(compareOrders);
    var body = byId('ordersBody');
    body.replaceChildren();
    byId('emptyOrders').classList.toggle('hidden', visibleOrders.length > 0);
    columns.forEach(function (column, index) {
      var button = byId('tableHead').children[index].querySelector('button');
      if (button) {
        button.textContent = column[1] + (sortKey === column[0] ?
          (sortDirection === 1 ? ' ↑' : ' ↓') : '');
      }
    });
    visibleOrders.forEach(function (order) {
      var row = document.createElement('tr');
      row.appendChild(makeCell(order.productName));
      row.appendChild(createFileCell(order));
      row.appendChild(makeCell(order.features));
      row.appendChild(makeCell(order.quantity));
      row.appendChild(makeCell(order.customerName));
      row.appendChild(makeCell(order.customerPhone));
      row.appendChild(makeCell(order.deliveryDate));
      row.appendChild(makeCell(order.deliveryMethod));
      row.appendChild(makeCell(order.printer));
      row.appendChild(makeCell(formatMoney(order.totalCost)));
      row.appendChild(makeCell(formatMoney(order.amountPaid)));
      row.appendChild(makeCell(formatMoney(orderBalance(order))));
      row.appendChild(makeCell(order.observations));
      var statusCell = document.createElement('td');
      var status = document.createElement('span');
      status.className = 'status';
      status.textContent = order.status;
      statusCell.appendChild(status);
      row.appendChild(statusCell);
      var actionsCell = document.createElement('td');
      var actions = document.createElement('div');
      actions.className = 'row-actions';
      var editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'button secondary';
      editButton.textContent = 'Editar';
      editButton.addEventListener('click', function () { beginEdit(order); });
      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button danger';
      deleteButton.textContent = 'Eliminar';
      deleteButton.addEventListener('click', function () { deleteOrder(order); });
      actions.append(editButton, deleteButton);
      actionsCell.appendChild(actions);
      row.appendChild(actionsCell);
      body.appendChild(row);
    });
    byId('orderSummary').textContent = orders.length +
      (orders.length === 1 ? ' pedido registrado' : ' pedidos registrados');
    renderCalendar();
  }

  function buildTableHeaders() {
    var head = byId('tableHead');
    columns.forEach(function (column) {
      var cell = document.createElement('th');
      if (column[0] === 'photo' || column[0] === 'actions') {
        cell.textContent = column[1];
        head.appendChild(cell);
        return;
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', function () {
        if (sortKey === column[0]) sortDirection *= -1;
        else { sortKey = column[0]; sortDirection = 1; }
        renderTable();
      });
      cell.appendChild(button);
      head.appendChild(cell);
    });
  }

  function renderCalendar() {
    var grid = byId('calendarGrid');
    grid.replaceChildren();
    var monthLabel = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(calendarMonth);
    byId('calendarTitle').textContent = monthLabel.charAt(0).toLocaleUpperCase('es') + monthLabel.slice(1);
    ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(function (label) {
      var weekday = document.createElement('span');
      weekday.className = 'weekday';
      weekday.textContent = label;
      grid.appendChild(weekday);
    });
    var firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    var startOffset = (firstDay.getDay() + 6) % 7;
    var gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startOffset);
    var today = toISODate(new Date());
    for (var i = 0; i < 42; i++) {
      var dayDate = new Date(gridStart);
      dayDate.setDate(gridStart.getDate() + i);
      var iso = toISODate(dayDate);
      var dayOrders = orders.filter(function (order) { return order.deliveryDate === iso; });
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'day';
      if (dayDate.getMonth() !== calendarMonth.getMonth()) button.classList.add('other');
      if (iso === today) button.classList.add('today');
      if (iso === selectedDate) button.classList.add('selected');
      if (dayOrders.length) button.classList.add('has-orders');
      button.setAttribute('aria-label', iso + (dayOrders.length ? ', ' + dayOrders.length +
        (dayOrders.length === 1 ? ' pedido' : ' pedidos') : ''));
      button.appendChild(document.createTextNode(String(dayDate.getDate())));
      if (dayOrders.length) {
        var count = document.createElement('span');
        count.className = 'day-count';
        count.textContent = dayOrders.length + (dayOrders.length === 1 ? ' pedido' : ' pedidos');
        button.appendChild(count);
      }
      button.addEventListener('click', function (date) {
        return function () { selectedDate = date; renderCalendar(); };
      }(iso));
      grid.appendChild(button);
    }
    var formattedDate = new Intl.DateTimeFormat('es', { dateStyle: 'long' })
      .format(new Date(selectedDate + 'T12:00:00'));
    byId('selectedDateTitle').textContent = 'Entregas: ' + formattedDate;
    var dayList = byId('dayOrders');
    dayList.replaceChildren();
    var selectedOrders = orders.filter(function (order) { return order.deliveryDate === selectedDate; });
    if (!selectedOrders.length) {
      var emptyItem = document.createElement('li');
      emptyItem.className = 'muted';
      emptyItem.textContent = 'No hay pedidos para esta fecha.';
      dayList.appendChild(emptyItem);
    } else {
      selectedOrders.forEach(function (order) {
        var item = document.createElement('li');
        item.textContent = order.productName + ' · ' + order.customerName + ' · ' + order.status;
        dayList.appendChild(item);
      });
    }
  }

  function resetOrderForm() {
    byId('orderForm').reset();
    byId('quantity').value = '1';
    byId('totalCost').value = '0';
    byId('amountPaid').value = '0';
    byId('balance').value = '0.00';
    byId('orderFormTitle').textContent = 'Nuevo pedido';
    byId('saveOrderButton').textContent = 'Guardar pedido';
    showFeedback('orderFeedback', '');
    editingId = null;
  }

  function beginEdit(order) {
    editingId = order.id;
    var form = byId('orderForm');
    ['productName', 'fileLink', 'features', 'quantity', 'customerName', 'customerPhone', 'deliveryDate',
      'deliveryMethod', 'printer', 'totalCost', 'amountPaid', 'status', 'observations'].forEach(function (name) {
      form.elements[name].value = order[name] === undefined ? '' : order[name];
    });
    byId('balance').value = formatMoney(orderBalance(order));
    byId('orderFormTitle').textContent = 'Editar pedido';
    byId('saveOrderButton').textContent = 'Guardar cambios';
    showFeedback('orderFeedback', '');
    byId('orderPanel').classList.remove('hidden');
    byId('orderPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteOrder(order) {
    if (!window.confirm('¿Eliminar el pedido de "' + order.productName + '"? Esta acción no se puede deshacer.')) return;
    try {
      await removeOrder(order.id);
      orders = orders.filter(function (item) { return item.id !== order.id; });
      renderTable();
    } catch (error) {
      window.alert('No se pudo eliminar el pedido: ' + error.message);
    }
  }

  function updateBalance() {
    var total = Number(byId('totalCost').value || 0);
    var paid = Number(byId('amountPaid').value || 0);
    byId('balance').value = formatMoney(total - paid);
  }

  function showDashboard() {
    setAuthentication(true);
    openDatabase().then(readOrders).then(function (savedOrders) {
      orders = savedOrders;
      renderTable();
    }).catch(function (error) {
      showFeedback('orderSummary', 'Error al cargar pedidos: ' + error.message);
    });
  }

  byId('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    showFeedback('loginFeedback', '');
    var button = byId('loginForm').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      var username = byId('loginUsername').value.trim().toLocaleLowerCase();
      var password = byId('loginPassword').value;
      if (username !== USERNAME || password !== PASSWORD) {
        showFeedback('loginFeedback', 'Usuario o contraseña incorrectos.');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, USERNAME);
      showDashboard();
    } catch (error) {
      showFeedback('loginFeedback', 'No se pudo iniciar sesión: ' + error.message);
    } finally {
      button.disabled = false;
    }
  });

  byId('logoutButton').addEventListener('click', function () {
    sessionStorage.removeItem(SESSION_KEY);
    orders = [];
    resetOrderForm();
    setAuthentication(false);
  });

  byId('newOrderButton').addEventListener('click', function () {
    resetOrderForm();
    byId('orderPanel').classList.remove('hidden');
    byId('orderPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('productName').focus();
  });
  byId('cancelOrderButton').addEventListener('click', function () {
    resetOrderForm();
    byId('orderPanel').classList.add('hidden');
  });
  byId('statusFilter').addEventListener('change', renderTable);
  byId('listTab').addEventListener('click', function () { setActiveView('list'); });
  byId('calendarTab').addEventListener('click', function () { setActiveView('calendar'); });
  byId('totalCost').addEventListener('input', updateBalance);
  byId('amountPaid').addEventListener('input', updateBalance);
  byId('previousMonth').addEventListener('click', function () {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderCalendar();
  });
  byId('nextMonth').addEventListener('click', function () {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderCalendar();
  });

  byId('exportOrdersButton').addEventListener('click', async function () {
    try {
      var savedOrders = await readOrders();
      var exportOrders = await Promise.all(savedOrders.map(async function (order) {
        var result = Object.assign({}, order);
        if (order.photo instanceof Blob) {
          result.photo = await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('No se pudo exportar una fotografía.')); };
            reader.readAsDataURL(order.photo);
          });
        }
        return result;
      }));
      var blob = new Blob([JSON.stringify(exportOrders, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'apex3d-pedidos-' + toISODate(new Date()) + '.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert('No se pudo descargar la copia: ' + error.message);
    }
  });

  byId('orderForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    var saveButton = byId('saveOrderButton');
    saveButton.disabled = true;
    showFeedback('orderFeedback', '');
    try {
      var form = byId('orderForm');
      var existing = orders.find(function (order) { return order.id === editingId; });
      var fileLink = form.elements.fileLink.value.trim();
      if (fileLink) {
        var parsedFileLink = new URL(fileLink);
        if (parsedFileLink.protocol !== 'https:' && parsedFileLink.protocol !== 'http:') {
          throw new Error('El enlace debe comenzar con http:// o https://.');
        }
      }
      var order = {
        id: editingId || createId(),
        productName: form.elements.productName.value.trim(),
        fileLink: fileLink,
        photo: existing ? existing.photo : null,
        features: form.elements.features.value.trim(),
        quantity: Number(form.elements.quantity.value),
        customerName: form.elements.customerName.value.trim(),
        customerPhone: form.elements.customerPhone.value.trim(),
        deliveryDate: form.elements.deliveryDate.value,
        deliveryMethod: form.elements.deliveryMethod.value,
        printer: form.elements.printer.value.trim(),
        totalCost: Number(form.elements.totalCost.value),
        amountPaid: Number(form.elements.amountPaid.value),
        observations: form.elements.observations.value.trim(),
        status: form.elements.status.value
      };
      if (!STATUSES.includes(order.status)) throw new Error('Selecciona un estado válido.');
      if (order.amountPaid > order.totalCost) throw new Error('La cantidad pagada no puede superar el costo total.');
      await saveOrder(order);
      var index = orders.findIndex(function (item) { return item.id === order.id; });
      if (index === -1) orders.push(order);
      else orders[index] = order;
      selectedDate = order.deliveryDate;
      calendarMonth = new Date(order.deliveryDate + 'T12:00:00');
      calendarMonth.setDate(1);
      renderTable();
      resetOrderForm();
      byId('orderPanel').classList.add('hidden');
    } catch (error) {
      showFeedback('orderFeedback', 'No se pudo guardar el pedido: ' + error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  try {
    if (!window.isSecureContext || !window.indexedDB) {
      byId('loginPanel').classList.remove('hidden');
      showFeedback('loginFeedback', 'Abre esta página con HTTPS para habilitar el almacenamiento local.');
      byId('loginForm').querySelector('button[type="submit"]').disabled = true;
    } else {
      buildTableHeaders();
      localStorage.removeItem('apex3d-local-accounts-v1');
      if (sessionStorage.getItem(SESSION_KEY) === USERNAME) {
        showDashboard();
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        setAuthentication(false);
      }
    }
  } catch (error) {
    byId('loginPanel').classList.remove('hidden');
    showFeedback('loginFeedback', error.message);
  }
}());
