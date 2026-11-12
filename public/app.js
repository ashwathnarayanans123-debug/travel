(() => {
  const $ = (id) => document.getElementById(id);

  let trips = [];
  let selected = Number(localStorage.getItem('roam-trip')) || null;
  let editingTripId = null;
  let editingExpenseId = null;
  let toastTimeout = null;

  const CATEGORIES = ['Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'];

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  const current = () => trips.find((t) => t.id === selected) || null;

  const slugify = (text) =>
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip';

  const money = (amount, currencyCode) => {
    const curr = currencyCode || current()?.currency || 'USD';
    const isZeroDecimal = curr === 'JPY';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: isZeroDecimal ? 0 : 2,
        maximumFractionDigits: isZeroDecimal ? 0 : 2,
      }).format(amount);
    } catch {
      return `${curr} ${Number(amount).toFixed(isZeroDecimal ? 0 : 2)}`;
    }
  };

  function toast(message, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = type === 'error' ? 'error' : type === 'warning' ? 'warning' : '';
    el.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.hidden = true;
    }, 4500);
  }

  async function api(path, method = 'GET', body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch('/api/' + path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
  }

  async function refresh() {
    trips = await api('trips');
    if (!current()) {
      selected = trips[0]?.id || null;
    }
    localStorage.setItem('roam-trip', selected || '');
    render();
  }

  function getSortedAndFilteredExpenses(expenses) {
    const searchVal = $('search').value.toLowerCase().trim();
    const catVal = $('filter-category').value;
    const sortVal = $('sort-by').value;

    let result = expenses.filter((e) => {
      const matchSearch =
        !searchVal ||
        e.description.toLowerCase().includes(searchVal) ||
        e.category.toLowerCase().includes(searchVal);
      const matchCat = catVal === 'ALL' || e.category === catVal;
      return matchSearch && matchCat;
    });

    result.sort((a, b) => {
      if (sortVal === 'date-desc') return b.date.localeCompare(a.date) || b.id - a.id;
      if (sortVal === 'date-asc') return a.date.localeCompare(b.date) || a.id - b.id;
      if (sortVal === 'amount-desc') return b.amount - a.amount;
      if (sortVal === 'amount-asc') return a.amount - b.amount;
      return 0;
    });

    return result;
  }

  function render() {
    const trip = current();

    // Populate Trip selector
    $('trip').innerHTML = trips.length
      ? trips.map((t) => `<option value="${t.id}">${esc(t.name)} (${esc(t.destination)})</option>`).join('')
      : '<option value="">No trips available</option>';

    if (trip) {
      $('trip').value = trip.id;
    }

    $('dashboard').hidden = !trip;
    $('empty').hidden = !!trip;
    $('edit-trip').hidden = !trip;
    $('delete-trip').hidden = !trip;

    if (!trip) return;

    // Financial Metrics
    const spent = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = trip.budget - spent;
    const isOverBudget = spent > trip.budget;
    const percentUsed = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;

    $('budget').textContent = money(trip.budget, trip.currency);
    $('spent').textContent = money(spent, trip.currency);
    $('destination').textContent = trip.destination;
    $('expense-count').textContent = `${trip.expenses.length} ${
      trip.expenses.length === 1 ? 'expense' : 'expenses'
    } recorded`;

    // Remaining card & Budget Meter
    const remainingCard = $('remaining-card');
    const remainingLabel = $('remaining-label');
    const meterFill = $('meter-bar-fill');
    const meterPercent = $('meter-percent');

    if (isOverBudget) {
      remainingCard.classList.add('over-budget');
      remainingLabel.textContent = 'OVER BUDGET';
      $('remaining').textContent = money(Math.abs(remaining), trip.currency);
      $('budget-note').textContent = `Over limit by ${money(spent - trip.budget, trip.currency)}`;
      meterPercent.textContent = `${Math.round(percentUsed)}% (Exceeded)`;
      meterPercent.className = 'meter-badge danger';
      meterFill.className = 'meter-bar-fill danger';
      meterFill.style.width = '100%';
    } else {
      remainingCard.classList.remove('over-budget');
      remainingLabel.textContent = 'LEFT TO EXPLORE';
      $('remaining').textContent = money(remaining, trip.currency);
      $('budget-note').textContent = `${Math.round(percentUsed)}% of your budget allocated`;

      const isWarning = percentUsed >= 80;
      meterPercent.textContent = `${Math.round(percentUsed)}% used`;
      meterPercent.className = `meter-badge ${isWarning ? 'warning' : ''}`;
      meterFill.className = `meter-bar-fill ${isWarning ? 'warning' : ''}`;
      meterFill.style.width = `${Math.min(percentUsed, 100)}%`;
    }

    // Filter & Render Expenses Table
    const filtered = getSortedAndFilteredExpenses(trip.expenses);
    $('expenses').innerHTML = filtered
      .map(
        (e) => `
        <tr>
          <td><strong>${esc(e.description)}</strong></td>
          <td><span class="category-tag ${esc(e.category)}">${esc(e.category)}</span></td>
          <td>${esc(e.date)}</td>
          <td class="amount-col">${money(e.amount, trip.currency)}</td>
          <td class="actions-col">
            <div class="action-btn-group">
              <button class="table-btn edit-btn" data-edit="${e.id}" title="Edit expense" aria-label="Edit ${esc(e.description)}">✎</button>
              <button class="table-btn delete-btn" data-delete="${e.id}" title="Delete expense" aria-label="Delete ${esc(e.description)}">✕</button>
            </div>
          </td>
        </tr>
      `
      )
      .join('');

    $('no-expenses').hidden = filtered.length > 0;
    if (filtered.length === 0) {
      $('no-expenses').textContent = trip.expenses.length
        ? 'No expenses match the current filter or search criteria.'
        : 'No expenses yet. Add your first travel expense.';
    }

    // Category Breakdown
    const catData = CATEGORIES.map((cat) => {
      const catTotal = trip.expenses
        .filter((e) => e.category === cat)
        .reduce((sum, e) => sum + e.amount, 0);
      return {
        name: cat,
        total: catTotal,
        share: spent > 0 ? (catTotal / spent) * 100 : 0,
      };
    }).filter((c) => c.total > 0 || spent === 0);

    $('categories').innerHTML = (catData.length ? catData : CATEGORIES.slice(0, 4).map(name => ({name, total: 0, share: 0})))
      .map(
        (c) => `
        <div class="category">
          <div class="category-line">
            <span>${c.name} <small style="color:var(--text-light)">(${Math.round(c.share)}%)</small></span>
            <span class="category-amount">${money(c.total, trip.currency)}</span>
          </div>
          <div class="bar">
            <span class="bar-${c.name}" style="width: ${c.share}%"></span>
          </div>
        </div>
      `
      )
      .join('');
  }

  // Dialog Opening Helpers
  function openTripModal(tripToEdit = null) {
    editingTripId = tripToEdit ? tripToEdit.id : null;
    $('trip-dialog-title').textContent = tripToEdit ? 'Edit trip details' : 'Plan a new trip';
    $('trip-submit-btn').textContent = tripToEdit ? 'Update trip ↗' : 'Create trip ↗';
    $('trip-form-id').value = tripToEdit ? tripToEdit.id : '';
    $('trip-name').value = tripToEdit ? tripToEdit.name : '';
    $('trip-dest').value = tripToEdit ? tripToEdit.destination : '';
    $('trip-budget').value = tripToEdit ? tripToEdit.budget : '';
    $('trip-currency').value = tripToEdit ? tripToEdit.currency : 'USD';
    $('trip-dialog').showModal();
    $('trip-name').focus();
  }

  function openExpenseModal(expenseToEdit = null) {
    const trip = current();
    if (!trip) {
      toast('Please create or select a trip first.', 'warning');
      return;
    }
    editingExpenseId = expenseToEdit ? expenseToEdit.id : null;
    $('expense-dialog-title').textContent = expenseToEdit ? 'Edit expense' : 'Add an expense';
    $('expense-submit-btn').textContent = expenseToEdit ? 'Update expense ↗' : 'Save expense ↗';
    $('expense-form-id').value = expenseToEdit ? expenseToEdit.id : '';
    $('expense-desc').value = expenseToEdit ? expenseToEdit.description : '';
    $('expense-amount').value = expenseToEdit ? expenseToEdit.amount : '';
    $('expense-cat').value = expenseToEdit ? expenseToEdit.category : 'Food';

    if (expenseToEdit) {
      $('expense-date').value = expenseToEdit.date;
    } else {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const da = String(now.getDate()).padStart(2, '0');
      $('expense-date').value = `${yr}-${mo}-${da}`;
    }

    $('expense-dialog').showModal();
    $('expense-desc').focus();
  }

  // Event Listeners - Trips
  $('new-trip').onclick = () => openTripModal();
  $('first-trip').onclick = () => openTripModal();
  $('edit-trip').onclick = () => {
    const trip = current();
    if (trip) openTripModal(trip);
  };

  $('delete-trip').onclick = async () => {
    const trip = current();
    if (!trip) return;
    const count = trip.expenses.length;
    const msg = count > 0
      ? `Delete trip "${trip.name}" and all ${count} associated expenses? This cannot be undone.`
      : `Delete trip "${trip.name}"?`;
    if (!confirm(msg)) return;

    try {
      await api(`trips/${trip.id}`, 'DELETE');
      selected = null;
      await refresh();
      toast('Trip deleted.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  $('trip').onchange = (e) => {
    selected = Number(e.target.value) || null;
    localStorage.setItem('roam-trip', selected || '');
    $('search').value = '';
    render();
  };

  // Event Listeners - Expenses
  $('add-expense').onclick = () => openExpenseModal();

  $('expenses').onclick = async (e) => {
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const expenseId = Number(delBtn.dataset.delete);
      if (!confirm('Delete this expense entry?')) return;
      try {
        await api(`expenses/${expenseId}`, 'DELETE');
        await refresh();
        toast('Expense deleted.');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }

    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const expenseId = Number(editBtn.dataset.edit);
      const trip = current();
      const exp = trip?.expenses.find((x) => x.id === expenseId);
      if (exp) openExpenseModal(exp);
    }
  };

  // Form Submissions
  $('trip-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('trip-submit-btn');
    btn.disabled = true;
    try {
      const payload = {
        name: $('trip-name').value.trim(),
        destination: $('trip-dest').value.trim(),
        budget: parseFloat($('trip-budget').value),
        currency: $('trip-currency').value,
      };

      if (editingTripId) {
        await api(`trips/${editingTripId}`, 'PUT', payload);
        toast('Trip updated successfully.');
      } else {
        const res = await api('trips', 'POST', payload);
        selected = res.id;
        toast('Trip created! Adventure awaits.');
      }

      await refresh();
      $('trip-dialog').close();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  $('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('expense-submit-btn');
    btn.disabled = true;
    try {
      const payload = {
        trip_id: selected,
        description: $('expense-desc').value.trim(),
        amount: parseFloat($('expense-amount').value),
        category: $('expense-cat').value,
        date: $('expense-date').value,
      };

      if (editingExpenseId) {
        await api(`expenses/${editingExpenseId}`, 'PUT', payload);
        toast('Expense updated successfully.');
      } else {
        await api('expenses', 'POST', payload);
        toast('Expense recorded.');
      }

      await refresh();
      $('expense-dialog').close();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  // Dialog Close buttons
  document.querySelectorAll('.close').forEach((b) => {
    b.onclick = () => b.closest('dialog').close();
  });

  // Filters & Sorting triggers
  $('search').oninput = render;
  $('filter-category').onchange = render;
  $('sort-by').onchange = render;

  // CSV Export with Injection Prevention & Descriptive File Name
  $('export').onclick = () => {
    const trip = current();
    if (!trip || !trip.expenses.length) {
      toast('No expenses to export for this trip.', 'warning');
      return;
    }

    const sanitizeCell = (val) => {
      let str = String(val ?? '');
      // Defend against formula injection in spreadsheet software
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replaceAll('"', '""')}"`;
    };

    const headerRows = [
      ['Trip Name', trip.name],
      ['Destination', trip.destination],
      ['Trip Budget', trip.budget],
      ['Currency', trip.currency],
      [],
      ['Description', 'Category', 'Date', 'Amount', 'Currency'],
    ];

    const dataRows = trip.expenses.map((e) => [
      e.description,
      e.category,
      e.date,
      e.amount,
      trip.currency,
    ]);

    const allRows = [...headerRows, ...dataRows];
    const csvContent =
      '\ufeff' +
      allRows
        .map((row) => (row.length ? row.map(sanitizeCell).join(',') : ''))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roam-${slugify(trip.name)}-expenses.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('CSV exported successfully.');
  };

  // Initial Data Load
  refresh().catch((err) => {
    toast('Could not connect to server: ' + err.message, 'error');
  });
})();
