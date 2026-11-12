/**
 * ROAM — Haute Travel Archive & Financial Ledger
 * Ultra-Realistic Cinematic UI/UX Upgrade
 * Physical Materials, Studio Lighting & Three.js ACESFilmic PBR Engine
 */

(() => {
  const $ = (id) => document.getElementById(id);

  // Application State
  let trips = [];
  let selectedTripId = Number(localStorage.getItem('roam-trip')) || null;
  let editingTripId = null;
  let editingExpenseId = null;
  let toastTimeout = null;

  const CATEGORIES = ['Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'];

  // Safe HTML character escaping
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  // Slugify for clean CSV download naming
  const slugify = (text) =>
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'expedition';

  // Get current active trip object
  const currentTrip = () => trips.find((t) => t.id === selectedTripId) || null;

  // Currency formatting with native Intl API
  const money = (amount, currencyCode) => {
    const curr = currencyCode || currentTrip()?.currency || 'USD';
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

  // High-End Amber Toast Notification
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

  // REST API Client wrapper
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

  // Synchronize with database
  async function refresh() {
    try {
      trips = await api('trips');
      if (!currentTrip()) {
        selectedTripId = trips[0]?.id || null;
      }
      localStorage.setItem('roam-trip', selectedTripId || '');
      render();
    } catch (err) {
      toast('Vault synchronization error: ' + err.message, 'error');
    }
  }

  // Filtering & Sorting
  function getFilteredExpenses(expenses) {
    const searchVal = ($('search')?.value || '').toLowerCase().trim();
    const catVal = $('filter-category')?.value || 'ALL';
    const sortVal = $('sort-by')?.value || 'date-desc';

    let result = (expenses || []).filter((e) => {
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

  // Primary UI Render Engine
  function render() {
    const trip = currentTrip();

    // Populate Trip Selection Dropdown
    const tripSelect = $('trip');
    if (tripSelect) {
      tripSelect.innerHTML = trips.length
        ? trips
            .map(
              (t) =>
                `<option value="${t.id}">${esc(t.name)} · ${esc(t.destination)}</option>`
            )
            .join('')
        : '<option value="">No Active Expeditions</option>';

      if (trip) {
        tripSelect.value = trip.id;
      }
    }

    // Toggle Dashboard vs Empty State
    const hasTrips = !!trip;
    if ($('dashboard')) $('dashboard').hidden = !hasTrips;
    if ($('empty')) $('empty').hidden = hasTrips;
    if ($('edit-trip')) $('edit-trip').hidden = !hasTrips;
    if ($('delete-trip')) $('delete-trip').hidden = !hasTrips;

    // Update Top Navigation Trip Indicator
    if ($('nav-current-trip-name')) {
      $('nav-current-trip-name').textContent = trip ? trip.name : 'Select Expedition';
    }
    if ($('nav-current-destination')) {
      $('nav-current-destination').textContent = trip ? `(${trip.destination})` : '';
    }

    // Update Hero Metadata Strip
    if ($('hero-horizon')) {
      $('hero-horizon').textContent = trip ? trip.destination : 'None active';
    }
    if ($('hero-currency')) {
      $('hero-currency').textContent = trip ? trip.currency : 'USD';
    }

    if (!trip) {
      if ($('hero-status')) $('hero-status').textContent = 'Awaiting Curation';
      return;
    }

    // Financial Metrics Calculation
    const spent = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = trip.budget - spent;
    const isOverBudget = spent > trip.budget;
    const percentUsed = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;

    // Update KPI Card Values
    if ($('budget')) $('budget').textContent = money(trip.budget, trip.currency);
    if ($('spent')) $('spent').textContent = money(spent, trip.currency);
    if ($('destination')) $('destination').textContent = trip.destination;
    if ($('expense-count')) {
      $('expense-count').textContent = `${trip.expenses.length} ${
        trip.expenses.length === 1 ? 'item' : 'items'
      } cataloged`;
    }

    // Budget Utilization Gauge & Capital Card
    const remainingCard = $('remaining-card');
    const remainingLabel = $('remaining-label');
    const gaugeFill = $('meter-bar-fill');
    const meterBadge = $('meter-percent');
    const gaugeStatus = $('gauge-status-text');

    if (isOverBudget) {
      if (remainingCard) remainingCard.classList.add('over-budget');
      if (remainingLabel) remainingLabel.textContent = 'DEFICIT CAPITAL EXCEEDED';
      if ($('remaining')) $('remaining').textContent = money(Math.abs(remaining), trip.currency);
      if ($('budget-note')) {
        $('budget-note').textContent = `Deficit of ${money(spent - trip.budget, trip.currency)}`;
      }
      if (meterBadge) {
        meterBadge.textContent = `${Math.round(percentUsed)}% · Exceeded`;
        meterBadge.className = 'meter-badge danger';
      }
      if (gaugeFill) {
        gaugeFill.className = 'gauge-fill danger';
        gaugeFill.style.width = '100%';
      }
      if (gaugeStatus) {
        gaugeStatus.textContent = 'Threshold Exceeded';
        gaugeStatus.style.color = '#FF7766';
      }
      if ($('hero-status')) $('hero-status').textContent = 'Deficit Alert';
    } else {
      if (remainingCard) remainingCard.classList.remove('over-budget');
      if (remainingLabel) remainingLabel.textContent = 'PRESERVED DISCOVERY CAPITAL';
      if ($('remaining')) $('remaining').textContent = money(remaining, trip.currency);
      if ($('budget-note')) {
        $('budget-note').textContent = `${Math.round(100 - percentUsed)}% capital preserved`;
      }

      const isWarning = percentUsed >= 80;
      if (meterBadge) {
        meterBadge.textContent = `${Math.round(percentUsed)}% Utilized`;
        meterBadge.className = `meter-badge ${isWarning ? 'warning' : ''}`;
      }
      if (gaugeFill) {
        gaugeFill.className = `gauge-fill ${isWarning ? 'warning' : ''}`;
        gaugeFill.style.width = `${Math.min(percentUsed, 100)}%`;
      }
      if (gaugeStatus) {
        gaugeStatus.textContent = isWarning ? 'Approaching Cap' : 'Harmonious Cadence';
        gaugeStatus.style.color = isWarning ? '#FFAA55' : 'var(--warm-ivory)';
      }
      if ($('hero-status')) $('hero-status').textContent = isWarning ? 'Nearing Cap' : 'In Balance';
    }

    // Render Expenditure Ledger Table
    const filtered = getFilteredExpenses(trip.expenses);
    const tbody = $('expenses');
    if (tbody) {
      tbody.innerHTML = filtered
        .map(
          (e) => `
          <tr>
            <td><strong>${esc(e.description)}</strong></td>
            <td><span class="category-tag ${esc(e.category)}">${esc(e.category)}</span></td>
            <td style="color:var(--soft-sand)">${esc(e.date)}</td>
            <td class="amount-col">${money(e.amount, trip.currency)}</td>
            <td class="th-actions">
              <div class="action-btn-group">
                <button class="table-btn edit-btn" data-edit="${e.id}" title="Modify expenditure" aria-label="Edit ${esc(e.description)}">✎</button>
                <button class="table-btn delete-btn" data-delete="${e.id}" title="Erase expenditure" aria-label="Delete ${esc(e.description)}">✕</button>
              </div>
            </td>
          </tr>
        `
        )
        .join('');
    }

    if ($('no-expenses')) {
      $('no-expenses').hidden = filtered.length > 0;
    }

    // Render Category Breakdown Bars
    const catContainer = $('categories');
    if (catContainer) {
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

      const displayCats = catData.length
        ? catData
        : CATEGORIES.slice(0, 4).map((name) => ({ name, total: 0, share: 0 }));

      catContainer.innerHTML = displayCats
        .map(
          (c) => `
          <div class="category-row">
            <div class="category-info">
              <span class="cat-title">${c.name} <span class="cat-share">(${Math.round(c.share)}%)</span></span>
              <span class="cat-amount">${money(c.total, trip.currency)}</span>
            </div>
            <div class="cat-track">
              <div class="cat-fill bar-${c.name}" style="width: ${c.share}%"></div>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  // Modal Dialog Handlers
  function openTripModal(tripToEdit = null) {
    editingTripId = tripToEdit ? tripToEdit.id : null;
    const dialogTitle = $('trip-dialog-title');
    const submitBtn = $('trip-submit-btn');

    if (dialogTitle) {
      dialogTitle.textContent = tripToEdit ? 'Modify Expedition' : 'Curate New Expedition';
    }
    if (submitBtn) {
      submitBtn.querySelector('span').textContent = tripToEdit ? 'Update Expedition' : 'Preserve Expedition';
    }

    if ($('trip-form-id')) $('trip-form-id').value = tripToEdit ? tripToEdit.id : '';
    if ($('trip-name')) $('trip-name').value = tripToEdit ? tripToEdit.name : '';
    if ($('trip-dest')) $('trip-dest').value = tripToEdit ? tripToEdit.destination : '';
    if ($('trip-budget')) $('trip-budget').value = tripToEdit ? tripToEdit.budget : '';
    if ($('trip-currency')) $('trip-currency').value = tripToEdit ? tripToEdit.currency : 'USD';

    $('trip-dialog').showModal();
    $('trip-name')?.focus();
  }

  function openExpenseModal(expenseToEdit = null) {
    const trip = currentTrip();
    if (!trip) {
      toast('Please curate an expedition first.', 'warning');
      return;
    }
    editingExpenseId = expenseToEdit ? expenseToEdit.id : null;
    const dialogTitle = $('expense-dialog-title');
    const submitBtn = $('expense-submit-btn');

    if (dialogTitle) {
      dialogTitle.textContent = expenseToEdit ? 'Modify Expenditure' : 'Record an Expenditure';
    }
    if (submitBtn) {
      submitBtn.querySelector('span').textContent = expenseToEdit ? 'Update Record' : 'Log Disbursement';
    }

    if ($('expense-form-id')) $('expense-form-id').value = expenseToEdit ? expenseToEdit.id : '';
    if ($('expense-desc')) $('expense-desc').value = expenseToEdit ? expenseToEdit.description : '';
    if ($('expense-amount')) $('expense-amount').value = expenseToEdit ? expenseToEdit.amount : '';
    if ($('expense-cat')) $('expense-cat').value = expenseToEdit ? expenseToEdit.category : 'Food';

    if (expenseToEdit) {
      if ($('expense-date')) $('expense-date').value = expenseToEdit.date;
    } else {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const da = String(now.getDate()).padStart(2, '0');
      if ($('expense-date')) $('expense-date').value = `${yr}-${mo}-${da}`;
    }

    $('expense-dialog').showModal();
    $('expense-desc')?.focus();
  }

  // Bind Buttons & Events
  ['nav-new-trip', 'hero-new-trip-btn', 'first-trip'].forEach((id) => {
    const el = $(id);
    if (el) el.onclick = () => openTripModal();
  });

  ['hero-add-expense-btn', 'add-expense'].forEach((id) => {
    const el = $(id);
    if (el) el.onclick = () => openExpenseModal();
  });

  if ($('edit-trip')) {
    $('edit-trip').onclick = () => {
      const trip = currentTrip();
      if (trip) openTripModal(trip);
    };
  }

  if ($('delete-trip')) {
    $('delete-trip').onclick = async () => {
      const trip = currentTrip();
      if (!trip) return;
      const count = trip.expenses.length;
      const promptText = count > 0
        ? `Permanently remove expedition "${trip.name}" along with all ${count} cataloged expenditures?`
        : `Permanently remove expedition "${trip.name}"?`;
      if (!confirm(promptText)) return;

      try {
        await api(`trips/${trip.id}`, 'DELETE');
        selectedTripId = null;
        await refresh();
        toast('Expedition archived and cleared.');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }

  if ($('trip')) {
    $('trip').onchange = (e) => {
      selectedTripId = Number(e.target.value) || null;
      localStorage.setItem('roam-trip', selectedTripId || '');
      if ($('search')) $('search').value = '';
      render();
    };
  }

  // Ledger Table Click Delegation (Edit / Delete)
  if ($('expenses')) {
    $('expenses').onclick = async (e) => {
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        const expenseId = Number(delBtn.dataset.delete);
        if (!confirm('Permanently remove this expenditure item?')) return;
        try {
          await api(`expenses/${expenseId}`, 'DELETE');
          await refresh();
          toast('Expenditure item erased.');
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) {
        const expenseId = Number(editBtn.dataset.edit);
        const trip = currentTrip();
        const exp = trip?.expenses.find((x) => x.id === expenseId);
        if (exp) openExpenseModal(exp);
      }
    };
  }

  // Form Submissions
  if ($('trip-form')) {
    $('trip-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('trip-submit-btn');
      if (btn) btn.disabled = true;
      try {
        const payload = {
          name: $('trip-name').value.trim(),
          destination: $('trip-dest').value.trim(),
          budget: parseFloat($('trip-budget').value),
          currency: $('trip-currency').value,
        };

        if (editingTripId) {
          await api(`trips/${editingTripId}`, 'PUT', payload);
          toast('Expedition parameters refined.');
        } else {
          const res = await api('trips', 'POST', payload);
          selectedTripId = res.id;
          toast('New expedition successfully immortalized.');
        }

        await refresh();
        $('trip-dialog').close();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }

  if ($('expense-form')) {
    $('expense-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('expense-submit-btn');
      if (btn) btn.disabled = true;
      try {
        const payload = {
          trip_id: selectedTripId,
          description: $('expense-desc').value.trim(),
          amount: parseFloat($('expense-amount').value),
          category: $('expense-cat').value,
          date: $('expense-date').value,
        };

        if (editingExpenseId) {
          await api(`expenses/${editingExpenseId}`, 'PUT', payload);
          toast('Expenditure record updated.');
        } else {
          await api('expenses', 'POST', payload);
          toast('Expenditure logged into vault.');
        }

        await refresh();
        $('expense-dialog').close();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    };
  }

  // Dialog Close buttons
  document.querySelectorAll('.modal-close, .cancel-btn').forEach((b) => {
    b.onclick = () => b.closest('dialog')?.close();
  });

  // Filter & Search Triggers
  if ($('search')) $('search').oninput = render;
  if ($('filter-category')) $('filter-category').onchange = render;
  if ($('sort-by')) $('sort-by').onchange = render;

  // CSV Export with Defense Against Formula Injection
  if ($('export')) {
    $('export').onclick = () => {
      const trip = currentTrip();
      if (!trip || !trip.expenses.length) {
        toast('No expenditures to export for active expedition.', 'warning');
        return;
      }

      const sanitizeCell = (val) => {
        let str = String(val ?? '');
        if (/^[=+\-@\t\r]/.test(str)) {
          str = "'" + str;
        }
        return `"${str.replaceAll('"', '""')}"`;
      };

      const headerRows = [
        ['Expedition Archive', trip.name],
        ['Destination Region', trip.destination],
        ['Allocated Capital', trip.budget],
        ['Currency Code', trip.currency],
        [],
        ['Description', 'Portfolio Category', 'Date of Disbursement', 'Amount', 'Currency'],
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
      link.download = `roam-${slugify(trip.name)}-portfolio.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('Portfolio CSV exported successfully.');
    };
  }

  // Subtle Interactive 3D Card Tilt for KPI Cards
  document.querySelectorAll('.kpi-card[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const tiltX = (y / (rect.height / 2)) * -4.5;
      const tiltY = (x / (rect.width / 2)) * 4.5;
      card.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });

  // =========================================================================
  // ULTRA-REALISTIC 3D CELESTIAL ASTROLABE (Three.js ACESFilmic PBR Engine)
  // Physically Based MeshPhysicalMaterial, Studio Lighting & Micro-Imperfections
  // =========================================================================
  function init3DCenterpiece() {
    const canvas = $('origami-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const container = canvas.parentElement;
    let width = container.clientWidth || 500;
    let height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 8.2);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ACESFilmic Tone Mapping & High-Fidelity Color Space
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    if (THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    // Procedural Studio Environment Reflection Map Generator
    // Gives metals real, dynamic architectural reflections without external HDRI assets
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();

      const envScene = new THREE.Scene();
      const envCanvas = document.createElement('canvas');
      envCanvas.width = 512;
      envCanvas.height = 256;
      const ctx = envCanvas.getContext('2d');

      // Gradient representing warm architectural golden hour interior
      const grad = ctx.createLinearGradient(0, 0, 512, 256);
      grad.addColorStop(0, '#100C09');
      grad.addColorStop(0.3, '#39271C');
      grad.addColorStop(0.65, '#E9C78D');
      grad.addColorStop(0.85, '#FFCC82');
      grad.addColorStop(1, '#1A120C');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Light portal highlight
      const radial = ctx.createRadialGradient(420, 50, 10, 420, 50, 140);
      radial.addColorStop(0, '#FFF6E8');
      radial.addColorStop(0.4, '#FFDCA0');
      radial.addColorStop(1, 'transparent');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, 512, 256);

      const envTexture = new THREE.CanvasTexture(envCanvas);
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmremGenerator.fromEquirectangular(envTexture);
      scene.environment = envMap.texture;
      envTexture.dispose();
      pmremGenerator.dispose();
    } catch {
      // Fallback gracefully if PMREM is unsupported
    }

    // Master Group for 3D Sculpture Hierarchy
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // 1. PRIMARY SCULPTURAL CORE: Multi-Faceted Origami Body
    // Using MeshPhysicalMaterial for photorealistic metallic bronze & champagne luster
    const coreGeo = new THREE.IcosahedronGeometry(2.0, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xE9C78D,             // Champagne Gold
      metalness: 0.86,
      roughness: 0.26,
      clearcoat: 0.4,
      clearcoatRoughness: 0.12,
      reflectivity: 0.85,
      flatShading: true,
      envMapIntensity: 1.4,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    masterGroup.add(coreMesh);

    // 2. INNER WARM-BRONZE GEOMETRIC SKELETON
    const innerGeo = new THREE.IcosahedronGeometry(1.5, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x93613B,             // Warm Bronze
      metalness: 0.9,
      roughness: 0.35,
      wireframe: true,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    masterGroup.add(innerMesh);

    // 3. PRECISION GIMBAL / CELESTIAL ASTROLABE RINGS
    // High-metalness burnished copper and champagne rings with realistic chamfers
    const ringMat1 = new THREE.MeshPhysicalMaterial({
      color: 0xB86A2D,             // Burnished Copper
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.45,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.6,
    });
    const ringGeo1 = new THREE.TorusGeometry(3.05, 0.024, 20, 120);
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringMesh1.rotation.x = Math.PI / 3;
    masterGroup.add(ringMesh1);

    const ringMat2 = new THREE.MeshPhysicalMaterial({
      color: 0xE9C78D,             // Champagne Gold
      metalness: 0.85,
      roughness: 0.25,
      clearcoat: 0.4,
      envMapIntensity: 1.5,
    });
    const ringGeo2 = new THREE.TorusGeometry(3.35, 0.018, 20, 120);
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.y = Math.PI / 4;
    ringMesh2.rotation.x = -Math.PI / 5;
    masterGroup.add(ringMesh2);

    const ringGeo3 = new THREE.TorusGeometry(3.6, 0.014, 16, 120);
    const ringMesh3 = new THREE.Mesh(ringGeo3, ringMat1);
    ringMesh3.rotation.z = Math.PI / 6;
    ringMesh3.rotation.y = -Math.PI / 3;
    masterGroup.add(ringMesh3);

    // 4. CELESTIAL POLAR NODES & PIVOT STUDS
    const pivotMat = new THREE.MeshStandardMaterial({
      color: 0xFFDCA0,
      metalness: 0.95,
      roughness: 0.15,
    });
    const pivotGeo = new THREE.SphereGeometry(0.065, 16, 16);
    
    [
      [0, 3.05, 0], [0, -3.05, 0],
      [3.35, 0, 0], [-3.35, 0, 0]
    ].forEach(([x, y, z]) => {
      const pMesh = new THREE.Mesh(pivotGeo, pivotMat);
      pMesh.position.set(x, y, z);
      masterGroup.add(pMesh);
    });

    // 5. LUMINOUS SUSPENDED DUST SPECKS
    const particleCount = 110;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 3.2 + Math.random() * 2.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particlePos[i] = radius * Math.sin(phi) * Math.cos(theta);
      particlePos[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePos[i + 2] = radius * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xFFDCA0,
      size: 0.045,
      transparent: true,
      opacity: 0.65,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    masterGroup.add(particleSystem);

    // 6. CINEMATIC THREE-POINT STUDIO LIGHTING RIG
    // Ambient Cool-Tint Shadow Fill
    const ambientLight = new THREE.AmbientLight(0x28232A, 0.7);
    scene.add(ambientLight);

    // Warm Key Light (Above & Right, Soft Golden Sunlight)
    const keyLight = new THREE.DirectionalLight(0xFFCC82, 3.4);
    keyLight.position.set(5.5, 7.0, 5.0);
    scene.add(keyLight);

    // Soft Bronze Bounce Light (From Left)
    const bounceLight = new THREE.DirectionalLight(0xD8A777, 1.25);
    bounceLight.position.set(-5.0, 1.5, 3.0);
    scene.add(bounceLight);

    // Controlled Amber Rim Light (Behind & Lower-Right)
    const rimLight = new THREE.DirectionalLight(0xFF9C42, 4.2);
    rimLight.position.set(-3.5, -4.0, -5.5);
    scene.add(rimLight);

    // Interactive Pointer Drag & Parallax Easing
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotationX = 0.22;
    let targetRotationY = 0.35;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotationY += deltaX * 0.006;
        targetRotationX += deltaY * 0.006;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    });

    // Touch Support for Mobile
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - prevMouseX;
        const deltaY = e.touches[0].clientY - prevMouseY;
        targetRotationY += deltaX * 0.006;
        targetRotationX += deltaY * 0.006;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    // Responsive Canvas Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      width = container.clientWidth || 500;
      height = container.clientHeight || 480;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    // Cinematic Animation Loop with Physics Easing
    let clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Very slow majestic natural drift
      if (!isDragging) {
        targetRotationY += 0.0022;
        targetRotationX = 0.22 + Math.sin(elapsedTime * 0.5) * 0.06;
      }

      // Smooth Lerp Damping
      masterGroup.rotation.y += (targetRotationY - masterGroup.rotation.y) * 0.05;
      masterGroup.rotation.x += (targetRotationX - masterGroup.rotation.x) * 0.05;

      // Subtle differential ring rotation
      ringMesh1.rotation.z = elapsedTime * 0.12;
      ringMesh2.rotation.z = -elapsedTime * 0.09;
      ringMesh3.rotation.x = elapsedTime * 0.07;

      // Organic vertical breathing motion
      masterGroup.position.y = Math.sin(elapsedTime * 0.75) * 0.09;

      // Particle field drift
      particleSystem.rotation.y = elapsedTime * 0.018;

      renderer.render(scene, camera);
    }
    animate();
  }

  // Initialize Data & 3D Centerpiece
  refresh();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init3DCenterpiece);
  } else {
    init3DCenterpiece();
  }
})();
