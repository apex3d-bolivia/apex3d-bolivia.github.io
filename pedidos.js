(function () {
  'use strict';

  var LEGACY_DB_NAME = 'apex3d-orders-v1';
  var STORAGE_BUCKET = 'order-photos';
  var STATUSES = ['Planeación', 'Imprimiendo', 'Concluido', 'Entregado'];
  var columns = [
    ['productName', 'Producto'], ['photo', 'Fotografía'], ['features', 'Características'],
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
  var activeUserId = null;
  var client = null;
  var objectUrls = [];

  function byId(id) { return document.getElementById(id); }
  function toISODate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function showFeedback(id, message) { byId(id).textContent = message; }
  function createId() {
    if (typeof crypto.randomUUID !== 'function') throw new Error('Este navegador debe ser actualizado para generar identificadores seguros.');
    return crypto.randomUUID();
  }
  function formatMoney(value) { return Number(value || 0).toFixed(2); }
  function orderBalance(order) { return Number(order.totalCost || 0) - Number(order.amountPaid || 0); }

  function setAuthentication(isAuthenticated) {
    byId('loginPanel').classList.toggle('hidden', isAuthenticated);
    byId('dashboard').classList.toggle('hidden', !isAuthenticated);
    byId('logoutButton').classList.toggle('hidden', !isAuthenticated);
    byId('changePasswordButton').classList.toggle('hidden', !isAuthenticated);
    if (!isAuthenticated) byId('passwordPanel').classList.add('hidden');
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

  function clearObjectUrls() {
    objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    objectUrls = [];
  }

  function makeCell(value) {
    var cell = document.createElement('td');
    cell.textContent = value === null || value === undefined ? '' : String(value);
    return cell;
  }

  function createImageCell(order) {
    var cell = document.createElement('td');
    if (order.photoUrl) {
      var image = document.createElement('img');
      image.className = 'product-photo';
      image.src = order.photoUrl;
      image.alt = 'Fotografía de ' + order.productName;
      cell.appendChild(image);
    } else {
      cell.textContent = '—';
    }
    return cell;
  }

  function compareOrders(a, b) {
    var left = a[sortKey];
    var right = b[sortKey];
    if (sortKey === 'balance') { left = orderBalance(a); right = orderBalance(b); }
    if (sortKey === 'photo' || sortKey === 'actions') return 0;
    if (typeof left === 'number' || typeof right === 'number') return (Number(left || 0) - Number(right || 0)) * sortDirection;
    return String(left || '').localeCompare(String(right || ''), 'es', { numeric: true, sensitivity: 'base' }) * sortDirection;
  }

  function renderTable() {
    var filter = byId('statusFilter').value;
    var visibleOrders = orders.filter(function (order) { return !filter || order.status === filter; }).slice().sort(compareOrders);
    var body = byId('ordersBody');
    body.replaceChildren();
    byId('emptyOrders').classList.toggle('hidden', visibleOrders.length > 0);
    columns.forEach(function (column, index) {
      var button = byId('tableHead').children[index].querySelector('button');
      if (button) button.textContent = column[1] + (sortKey === column[0] ? (sortDirection === 1 ? ' ↑' : ' ↓') : '');
    });
    visibleOrders.forEach(function (order) {
      var row = document.createElement('tr');
      row.appendChild(makeCell(order.productName));
      row.appendChild(createImageCell(order));
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
    byId('orderSummary').textContent = orders.length + (orders.length === 1 ? ' pedido registrado' : ' pedidos registrados');
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
    var formattedDate = new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(selectedDate + 'T12:00:00'));
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

  function mapOrder(row, photoUrl) {
    return {
      id: row.id,
      productName: row.product_name,
      photoPath: row.photo_path,
      photoUrl: photoUrl,
      features: row.features || '',
      quantity: row.quantity,
      customerName: row.customer_name,
      customerPhone: row.customer_phone || '',
      deliveryDate: row.delivery_date,
      deliveryMethod: row.delivery_method,
      printer: row.printer || '',
      totalCost: Number(row.total_cost),
      amountPaid: Number(row.amount_paid),
      observations: row.observations || '',
      status: row.status
    };
  }

  async function signedPhotoUrl(path) {
    if (!path) return null;
    var result = await client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
    if (result.error) throw result.error;
    return result.data.signedUrl;
  }

  async function loadOrders() {
    var result = await client.from('orders')
      .select('id, product_name, photo_path, features, quantity, customer_name, customer_phone, delivery_date, delivery_method, printer, total_cost, amount_paid, observations, status')
      .order('delivery_date', { ascending: true });
    if (result.error) throw result.error;
    orders = await Promise.all(result.data.map(async function (row) {
      return mapOrder(row, await signedPhotoUrl(row.photo_path));
    }));
    renderTable();
  }

  function databaseRow(order, photoPath) {
    return {
      id: order.id,
      product_name: order.productName,
      photo_path: photoPath,
      features: order.features,
      quantity: order.quantity,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      delivery_date: order.deliveryDate,
      delivery_method: order.deliveryMethod,
      printer: order.printer,
      total_cost: order.totalCost,
      amount_paid: order.amountPaid,
      observations: order.observations,
      status: order.status
    };
  }

  async function uploadPhoto(orderId, photo) {
    if (!photo) return null;
    var path = orderId + '/' + createId() + '.jpg';
    var result = await client.storage.from(STORAGE_BUCKET).upload(path, photo, {
      contentType: 'image/jpeg',
      upsert: false
    });
    if (result.error) throw result.error;
    return path;
  }

  async function deletePhoto(path) {
    if (!path) return;
    var result = await client.storage.from(STORAGE_BUCKET).remove([path]);
    if (result.error) throw result.error;
  }

  async function upsertOrder(order, photoBlob, existingPhotoPath) {
    var photoPath = existingPhotoPath;
    var newPhotoPath = null;
    if (photoBlob) {
      newPhotoPath = await uploadPhoto(order.id, photoBlob);
      photoPath = newPhotoPath;
    }
    var result = await client.from('orders').upsert(databaseRow(order, photoPath), { onConflict: 'id' });
    if (result.error) {
      if (newPhotoPath) await deletePhoto(newPhotoPath);
      throw result.error;
    }
    if (newPhotoPath && existingPhotoPath && existingPhotoPath !== newPhotoPath) {
      try {
        await deletePhoto(existingPhotoPath);
      } catch (error) {
        window.alert('El pedido se guardó, pero no se pudo retirar la fotografía anterior: ' + error.message);
      }
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
    ['productName', 'features', 'quantity', 'customerName', 'customerPhone', 'deliveryDate',
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
    var result = await client.from('orders').delete().eq('id', order.id);
    if (result.error) {
      window.alert('No se pudo eliminar el pedido: ' + result.error.message);
      return;
    }
    orders = orders.filter(function (item) { return item.id !== order.id; });
    renderTable();
    if (order.photoPath) {
      try {
        await deletePhoto(order.photoPath);
      } catch (error) {
        window.alert('El pedido se eliminó, pero no se pudo retirar su fotografía: ' + error.message);
      }
    }
  }

  async function compressPhoto(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen válido.');
    var bitmap = await createImageBitmap(file);
    var scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    var context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la fotografía en este navegador.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo convertir la fotografía.'));
      }, 'image/jpeg', 0.82);
    });
  }

  function updateBalance() {
    var total = Number(byId('totalCost').value || 0);
    var paid = Number(byId('amountPaid').value || 0);
    byId('balance').value = formatMoney(total - paid);
  }

  function readLegacyOrders() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(LEGACY_DB_NAME);
      request.onerror = function () { reject(request.error || new Error('No se pudo abrir el almacenamiento anterior.')); };
      request.onsuccess = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('orders')) {
          db.close();
          resolve([]);
          return;
        }
        var transaction = db.transaction('orders', 'readonly');
        var getRequest = transaction.objectStore('orders').getAll();
        getRequest.onsuccess = function () { resolve(getRequest.result); };
        getRequest.onerror = function () { reject(getRequest.error || new Error('No se pudieron leer los pedidos anteriores.')); };
        transaction.oncomplete = function () { db.close(); };
      };
    });
  }

  async function importLegacyOrders() {
    var button = byId('importLocalButton');
    button.disabled = true;
    try {
      var localOrders = await readLegacyOrders();
      if (!localOrders.length) {
        window.alert('No se encontraron pedidos guardados en este navegador.');
        return;
      }
      if (!window.confirm('Se importarán ' + localOrders.length +
        ' pedidos desde este navegador a la base compartida de APEx3D. Sus fotografías también se subirán. Los datos locales originales no se borrarán. ¿Continuar?')) return;
      var imported = 0;
      var failures = [];
      for (var i = 0; i < localOrders.length; i++) {
        var old = localOrders[i];
        try {
          var id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(old.id) ? old.id : createId();
          var order = {
            id: id,
            productName: String(old.productName || '').trim(),
            features: String(old.features || ''),
            quantity: Number(old.quantity),
            customerName: String(old.customerName || '').trim(),
            customerPhone: String(old.customerPhone || ''),
            deliveryDate: old.deliveryDate,
            deliveryMethod: old.deliveryMethod,
            printer: String(old.printer || ''),
            totalCost: Number(old.totalCost),
            amountPaid: Number(old.amountPaid || 0),
            observations: String(old.observations || ''),
            status: old.status
          };
          if (!order.productName || !order.customerName || !order.deliveryDate ||
              !STATUSES.includes(order.status) || order.amountPaid > order.totalCost) {
            throw new Error('El pedido no cumple las validaciones actuales.');
          }
          var photo = old.photo instanceof Blob ? old.photo : null;
          var existing = orders.find(function (item) { return item.id === order.id; });
          await upsertOrder(order, photo, existing ? existing.photoPath : null);
          imported++;
        } catch (error) {
          failures.push('Pedido ' + (i + 1) + ': ' + error.message);
        }
      }
      await loadOrders();
      var message = imported + ' de ' + localOrders.length + ' pedidos importados. Los originales siguen guardados aquí.';
      if (failures.length) message += '\nNo se pudieron importar:\n' + failures.join('\n');
      window.alert(message);
    } catch (error) {
      window.alert('No se pudieron importar los pedidos locales: ' + error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function confirmSession(session) {
    if (!session || !session.user) {
      activeUserId = null;
      orders = [];
      setAuthentication(false);
      return;
    }
    var userId = session.user.id;
    if (activeUserId === userId) return;
    activeUserId = userId;
    var allowResult = await client.rpc('is_allowed_user');
    if (allowResult.error || allowResult.data !== true) {
      activeUserId = null;
      await client.auth.signOut();
      setAuthentication(false);
      showFeedback('loginFeedback', 'Este correo no está autorizado para acceder a los pedidos.');
      return;
    }
    showFeedback('loginFeedback', '');
    setAuthentication(true);
    try {
      await loadOrders();
    } catch (error) {
      showFeedback('orderSummary', 'No se pudieron cargar los pedidos: ' + error.message);
    }
  }

  byId('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = byId('loginForm').querySelector('button[type="submit"]');
    button.disabled = true;
    showFeedback('loginFeedback', '');
    try {
      var result = await client.auth.signInWithPassword({
        email: byId('loginEmail').value.trim(),
        password: byId('loginPassword').value
      });
      if (result.error) throw result.error;
      await confirmSession(result.data.session);
    } catch (error) {
      showFeedback('loginFeedback', 'No se pudo iniciar sesión. Verifica el correo y la contraseña, o confirma que tu cuenta fue invitada.');
    } finally {
      button.disabled = false;
    }
  });

  byId('recoverPasswordButton').addEventListener('click', async function () {
    var email = byId('loginEmail').value.trim();
    if (!email) {
      showFeedback('loginFeedback', 'Escribe primero el correo autorizado para enviar el enlace de recuperación.');
      byId('loginEmail').focus();
      return;
    }
    try {
      var result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (result.error) throw result.error;
      showFeedback('loginFeedback', 'Si la cuenta puede restablecer la contraseña, recibirás un correo con los pasos.');
    } catch (error) {
      showFeedback('loginFeedback', 'No se pudo solicitar el restablecimiento. Inténtalo de nuevo más tarde.');
    }
  });

  byId('changePasswordButton').addEventListener('click', function () {
    byId('passwordPanel').classList.remove('hidden');
    showFeedback('passwordFeedback', '');
    byId('passwordPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('newPassword').focus();
  });
  byId('cancelPasswordButton').addEventListener('click', function () {
    byId('passwordForm').reset();
    byId('passwordPanel').classList.add('hidden');
  });
  byId('passwordForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    var password = byId('newPassword').value;
    if (password.length < 8 || password !== byId('confirmPassword').value) {
      showFeedback('passwordFeedback', 'Las contraseñas deben coincidir y tener al menos 8 caracteres.');
      return;
    }
    var button = byId('passwordForm').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      var result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      byId('passwordForm').reset();
      byId('passwordPanel').classList.add('hidden');
      window.alert('La contraseña se actualizó correctamente.');
    } catch (error) {
      showFeedback('passwordFeedback', 'No se pudo actualizar la contraseña: ' + error.message);
    } finally {
      button.disabled = false;
    }
  });

  byId('logoutButton').addEventListener('click', async function () {
    var result = await client.auth.signOut();
    if (result.error) {
      window.alert('No se pudo cerrar la sesión: ' + result.error.message);
      return;
    }
    activeUserId = null;
    orders = [];
    resetOrderForm();
    byId('passwordForm').reset();
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
  byId('importLocalButton').addEventListener('click', importLegacyOrders);
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

  byId('orderForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    var saveButton = byId('saveOrderButton');
    saveButton.disabled = true;
    showFeedback('orderFeedback', '');
    try {
      var form = byId('orderForm');
      var existing = orders.find(function (order) { return order.id === editingId; });
      var photoFile = byId('productPhoto').files[0];
      var photoBlob = photoFile ? await compressPhoto(photoFile) : null;
      var order = {
        id: editingId || createId(),
        productName: form.elements.productName.value.trim(),
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
      if (!Number.isFinite(order.totalCost) || !Number.isFinite(order.amountPaid) ||
          order.totalCost < 0 || order.amountPaid < 0 || order.amountPaid > order.totalCost) {
        throw new Error('Verifica el costo total y el monto pagado; el pago no puede superar el costo.');
      }
      if (!Number.isInteger(order.quantity) || order.quantity < 1) throw new Error('La cantidad debe ser un número entero mayor que cero.');
      await upsertOrder(order, photoBlob, existing ? existing.photoPath : null);
      selectedDate = order.deliveryDate;
      calendarMonth = new Date(order.deliveryDate + 'T12:00:00');
      calendarMonth.setDate(1);
      resetOrderForm();
      byId('orderPanel').classList.add('hidden');
      try {
        await loadOrders();
      } catch (error) {
        showFeedback('orderSummary', 'El pedido se guardó, pero no se pudo actualizar la lista: ' + error.message);
      }
    } catch (error) {
      showFeedback('orderFeedback', 'No se pudo guardar el pedido: ' + error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  var config = window.APEx3D_SUPABASE_CONFIG || {};
  if (!window.isSecureContext || !config.url || !config.anonKey ||
      !window.supabase || typeof window.supabase.createClient !== 'function') {
    byId('configNotice').textContent = 'El panel privado aún no está configurado. Revisa supabase-config.js y completa la configuración inicial de Supabase indicada en README.md.';
    byId('configNotice').classList.remove('hidden');
  } else {
    try {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      buildTableHeaders();
      setAuthentication(false);
      client.auth.onAuthStateChange(function (event, session) {
        window.setTimeout(function () {
          if (event === 'SIGNED_OUT') {
            activeUserId = null;
            orders = [];
            setAuthentication(false);
          } else if (session) {
            confirmSession(session).catch(function (error) {
              activeUserId = null;
              setAuthentication(false);
              showFeedback('loginFeedback', 'No se pudo validar el acceso: ' + error.message);
            });
          }
        }, 0);
      });
      client.auth.getSession().then(function (result) {
        if (result.error) throw result.error;
        if (result.data.session) return confirmSession(result.data.session);
      }).catch(function (error) {
        showFeedback('loginFeedback', 'No se pudo comprobar la sesión: ' + error.message);
      });
    } catch (error) {
      byId('configNotice').textContent = 'No se pudo inicializar el acceso seguro: ' + error.message;
      byId('configNotice').classList.remove('hidden');
    }
  }
}());
