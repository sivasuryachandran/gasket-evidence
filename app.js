(function () {
  'use strict';

  // All dynamic text goes through textContent / setAttribute, never innerHTML:
  // the data comes from GitLab and must not be able to inject markup.
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  // GitLab profile chip: avatar (https only, initial as fallback) + @username.
  function who(actor, large) {
    if (!actor || !actor.username) return h('span', { class: 'muted', text: 'not recorded' });
    var cls = 'av' + (large ? ' lg' : '');
    var avatar;
    if (!STATIC_SNAPSHOT && actor.avatar_url && /^https:\/\//.test(actor.avatar_url)) {
      avatar = h('img', { class: cls, src: actor.avatar_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      avatar.addEventListener('error', function () { avatar.replaceWith(h('span', { class: cls, text: actor.username.charAt(0).toUpperCase() })); });
    } else {
      avatar = h('span', { class: cls, text: actor.username.charAt(0).toUpperCase() });
    }
    var kinds = { ci: 'CI automation', duo: 'Duo agent' };
    var bot = !!kinds[actor.kind];
    var label = bot ? h('span', {}, [kinds[actor.kind]]) : h('span', {}, ['@' + actor.username]);
    var attrs = { class: 'who', title: (bot ? 'Automation account: @' : (actor.name || actor.username) + ' · @') + actor.username };
    if (actor.web_url && /^https:\/\/gitlab\.com\//.test(actor.web_url)) { attrs.href = actor.web_url; attrs.target = '_blank'; attrs.rel = 'noopener'; }
    return h(attrs.href ? 'a' : 'span', attrs, [avatar, label]);
  }

  var OUTCOME = {
    released_eligible: { label: 'Release eligible', cls: 'ok' },
    expected_block: { label: 'Blocked (expected)', cls: 'blocked' },
    unexpected_block: { label: 'Blocked (unexpected)', cls: 'danger' },
    unexpected_pass: { label: 'Passed (unexpected)', cls: 'danger' },
    no_decision: { label: 'No decision recorded', cls: 'gray' },
    running: { label: 'Running', cls: 'info' },
    out_of_scope: { label: 'Not a release run', cls: 'gray' }
  };
  var SCENARIO = { a: 'A healthy', 'b-stale': 'B stale evidence', c: 'C fairness regression', d: 'D repaired', regression: 'Injected regression (demo)' };
  var STAGE = { eligible: 'Eligible', awaiting_approval: 'Awaiting approval', deploying: 'Deploying', deployed_mock: 'Release recorded', deployed: 'Deployed', runtime_verified: 'Runtime verified', artifact_verified: 'Runtime verified', runtime_verify_failed: 'Runtime verification failed', deploy_failed: 'Deploy failed', deploy_canceled: 'Deploy canceled' };
  var RUNTIME_CAPTION = 'Runtime verified: the deployed artifact\'s digest matches the signed evidence. (Artifact-integrity check, not a live-inference test; deploy is still mock.)';
  var STEPS = ['eligible', 'awaiting_approval', 'deployed', 'runtime_verified'];

  // Eligible > Awaiting approval > Deployed > Runtime verified. A recorded (mock) release never reaches the last two.
  function stageTracker(run, compact) {
    var stage = run.release_stage;
    var reached = { eligible: 1, awaiting_approval: 2, deploying: 2, deployed_mock: 3, artifact_verified: 4, runtime_verify_failed: 3, deploy_failed: 2, deploy_canceled: 2, deployed: 3, runtime_verified: 4 }[stage] || 0;
    var el = h('div', { class: 'stages' });
    STEPS.forEach(function (key, i) {
      // A recorded release (the mock job) turns this step green but dashed and labelled "Release recorded": the
      // release was recorded, but no service was deployed, so Runtime verified never follows it.
      var mock = key === 'deployed' && (stage === 'deployed_mock' || stage === 'artifact_verified' || stage === 'runtime_verify_failed');
      // Runtime verified after a mock deploy is an artifact-integrity check: lit, but dashed and captioned as such.
      var artifact = key === 'runtime_verified' && stage === 'artifact_verified';
      var attrs = { class: 'stage ' + (i < reached ? 'done' : 'todo') + (mock || artifact ? ' mock' : '') + (i === reached - 1 ? ' now' : ''),
        text: mock ? 'Release recorded' : STAGE[key] };
      if (mock) attrs.title = 'The release was recorded (receipt marked mock). No service was deployed.';
      if (artifact) attrs.title = RUNTIME_CAPTION;
      el.appendChild(h('span', attrs));
    });
    var note = stage === 'awaiting_approval' ? 'The deploy job has not run. Whether anyone approved is read from GitLab\'s approval record, never inferred from the job being manual.'
      : stage === 'deployed_mock' ? 'Release recorded: no service was deployed or verified (the receipt is marked mock).'
      : stage === 'deploy_failed' ? 'Deployment failed' + (run.deployment && run.deployment.failure ? ' at ' + run.deployment.failure.stage + '; ' + (run.deployment.previous_revision_still_serving ? 'the previous revision is still serving.' : 'check the receipt.') : '.')
      : stage === 'artifact_verified' ? RUNTIME_CAPTION
      : stage === 'runtime_verify_failed' ? ((run.runtime_verification && run.runtime_verification.note) || 'Runtime verification failed.')
      : stage === 'runtime_verified' ? 'The running service reported the evidenced model hash and passed the smoke checks.'
      : '';
    // The deploy is started in GitLab, in the real release pipeline. This page holds no token and starts nothing;
    // it only links to the place where a person does it.
    var door = null;
    var BAR = {
      deploying: ['run', 'Deployment running\u2026'],
      deployed_mock: ['done', 'Release recorded'],
      artifact_verified: ['done', 'Release recorded \u00b7 artifact digest verified'],
      runtime_verify_failed: ['bad', 'Runtime verification failed'],
      deployed: ['done', 'Deployed'],
      runtime_verified: ['done', 'Deployed and runtime verified'],
      deploy_failed: ['bad', 'Deployment failed'],
      deploy_canceled: ['bad', 'Deployment canceled']
    };
    if (stage === 'awaiting_approval' && run.web_url && /^https:\/\/gitlab\.com\//.test(run.web_url)) {
      door = h('p', { class: 'sub' }, [
        h('a', { class: 'btn-deploy', href: run.web_url, target: '_blank', rel: 'noopener',
          title: 'Review and start the deploy in GitLab \u2192 (open the pipeline and start the deploy job)', text: 'Deploy \u2197' })
      ]);
    } else if (BAR[stage]) {
      // Reflects the last synced state of the deploy job in GitLab; it is not a live feed.
      var mockNote = (stage === 'deployed_mock' || stage === 'artifact_verified') ? ' No service was deployed (the receipt is marked mock).' : '';
      door = h('p', { class: 'sub' }, [
        h('span', { class: 'deploybar ' + BAR[stage][0], role: 'status', title: 'Last synced state of the deploy job in GitLab.' + mockNote, text: BAR[stage][1] })
      ]);
    }
    return h('div', {}, [el, note ? h('p', { class: 'sub', text: note }) : null, compact ? null : door]);
  }
  var NOT_RECORDED = 'not recorded';

  function fmtSec(v) { return v === null || v === undefined ? NOT_RECORDED : (v >= 60 ? Math.floor(v / 60) + 'm ' + Math.round(v % 60) + 's' : v.toFixed(0) + 's'); }
  function fmtTime(iso) { return iso ? iso.replace('T', ' ').replace(/:\d\dZ$/, ' UTC').replace(/\.\d+Z$/, ' UTC') : NOT_RECORDED; }
  function num(v, d) { return v === null || v === undefined ? NOT_RECORDED : Number(v).toFixed(d === undefined ? 4 : d); }
  function median(vals) {
    var v = vals.filter(function (x) { return x !== null && x !== undefined; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function diffCount(a, b) {
    var n = 0, len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) if (a[i] !== b[i]) n++;
    return n;
  }
  function chip(outcome) {
    var o = OUTCOME[outcome] || { label: outcome, cls: 'gray' };
    return h('span', { class: 'chip ' + o.cls, text: o.label });
  }
  function sec(title, sub) {
    var el = h('section', {}, [h('h2', { text: title })]);
    if (sub) el.appendChild(h('p', { class: 'sub', text: sub }));
    return el;
  }

  var DEPLOY = {
    manual: 'Not started. A person starts the deploy job in GitLab.',
    skipped: 'Skipped because the release was blocked.',
    success: 'Deployment job succeeded.',
    failed: 'Deployment job failed.',
    running: 'Deployment job running.',
    pending: 'Deployment job pending.',
    created: 'Deployment job created.',
    canceled: 'Deployment job canceled.'
  };

  // Display names only; the machine codes underneath never change. Mirrors gasket/vocab.py.
  var REASON_TITLE = {
    MODEL_HASH_MISMATCH: 'Stale evidence: model differs from the evaluated model',
    IMAGE_DIGEST_MISMATCH: 'Stale evidence: image differs from the evaluated image',
    DATA_HASH_MISMATCH: 'Stale evidence: evaluation data differs',
    POLICY_HASH_MISMATCH: 'Stale evidence: policy changed after evaluation',
    COMMIT_MISMATCH: 'Stale evidence: different commit',
    PIPELINE_IDENTITY_MISMATCH: 'Stale evidence: different pipeline',
    ACCURACY_BELOW_THRESHOLD: 'Policy not met: accuracy below minimum',
    FAIRNESS_GAP_EXCEEDED: 'Policy not met: fairness gap over maximum',
    FAIRNESS_NOT_EVALUABLE: 'Unverifiable: fairness could not be measured',
    SECURITY_EVIDENCE_MISSING: 'Unverifiable: security evidence missing',
    EVIDENCE_MISSING: 'Unverifiable: evidence missing',
    EVIDENCE_INVALID: 'Unverifiable: evidence value not trusted',
    METRICS_MISMATCH: 'Disputed: claimed metrics differ from the recomputed metrics',
    METRICS_UNVERIFIABLE: 'Unverifiable: the Witness could not recompute the metrics'
  };
  var TRUST = {
    trusted: { cls: 'ok', text: 'Trusted / Verified', hint: 'Evidence matches the build and the policy checks passed.' },
    stale: { cls: 'blocked', text: 'Stale / Untrusted', hint: 'Evidence no longer matches the build; it is not proof for this artifact.' },
    unverifiable: { cls: 'gray', text: 'Unverifiable', hint: 'Evidence is missing, invalid or not measurable.' },
    policy_not_met: { cls: 'amber', text: 'Policy not met', hint: 'Evidence matches the build, but a policy threshold was not met.' },
    disputed: { cls: 'danger', text: 'Disputed', hint: 'The numbers the evidence claims do not match what the Witness recomputed from the exact model.' }
  };
  function trustChip(run) {
    var t = TRUST[run.trust];
    if (!t) return h('span', { class: 'chip gray', text: 'No decision recorded' });
    return h('span', { class: 'chip ' + t.cls, text: t.text, title: t.hint });
  }


  var ROUTES = [
    { key: 'overview', label: 'Overview' },
    { key: 'runs', label: 'Release runs' },
    { key: 'people', label: 'Contributors' },
    { key: 'models', label: 'Models' },
    { key: 'duo', label: 'Duo assessments' }
  ];

  function ext(href, label) {
    return h('a', { href: href, target: '_blank', rel: 'noopener', class: 'nav ext' }, [label, h('span', { class: 'xi', 'aria-hidden': 'true', text: '↗' })]);
  }

  // Routes look like #/runs?outcome=expected_block&n=50 so a filtered view can be shared.
  function parseRoute() {
    var raw = (location.hash || '#/overview').replace(/^#\/?/, '');
    var split = raw.split('?');
    var parts = split[0].split('/');
    var query = {};
    (split[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    var arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    return { name: parts[0] || 'overview', arg: arg, id: arg && /^\d+$/.test(arg) ? Number(arg) : null, query: query };
  }

  function hashFor(name, query) {
    var pairs = Object.keys(query || {}).filter(function (k) { return query[k]; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
    return '#/' + name + (pairs.length ? '?' + pairs.join('&') : '');
  }

  var lastRunsHash = '#/runs';
  var SNAPSHOT = '';
  var STATIC_SNAPSHOT = !!(window.GASKET_DATA && window.GASKET_DATA.snapshot);   // a snapshot makes no network calls

  function render(data) {
    var byId = {};
    data.runs.forEach(function (r) { byId[r.id] = r; });
    document.getElementById('gitlab-link').setAttribute('href', data.project_url);
    SNAPSHOT = data.generated_at ? 'Snapshot ' + fmtTime(data.generated_at) : '';
    var st = document.getElementById('snap-time');
    if (st && SNAPSHOT) { st.textContent = SNAPSHOT; st.hidden = false; }
    var tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('gasket-theme', next); } catch (e) {}
    });
    var nt = document.getElementById('nav-toggle');
    if (nt) nt.addEventListener('click', function () { var open = document.body.classList.toggle('nav-open'); nt.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    var side = document.getElementById('side');
    var app = document.getElementById('app');

    function draw() {
      var route = parseRoute();
      var active = route.name === 'run' ? 'runs' : route.name;
      if (route.name === 'runs') lastRunsHash = location.hash || '#/runs';
      side.textContent = '';
      var nav = h('nav', { 'aria-label': 'Gasket sections' });
      ROUTES.forEach(function (r) {
        nav.appendChild(h('a', { href: '#/' + r.key, class: 'nav' + (r.key === active ? ' active' : ''), 'aria-current': r.key === active ? 'page' : 'false', text: r.label }));
      });
      side.appendChild(nav);
      side.appendChild(h('div', { class: 'sidehead', text: 'In GitLab' }));
      side.appendChild(h('nav', { 'aria-label': 'GitLab links' }, [
        ext(data.project_url, 'Repository'),
        ext(data.project_url + '/-/pipelines', 'Pipelines'),
        ext(data.project_url + '/-/merge_requests', 'Merge requests'),
        ext(data.project_url + '/-/environments', 'Environments')
      ]));
      side.appendChild(h('p', { class: 'sidenote', text: 'Gasket is read-only. Starting pipelines and approving deployments happen in GitLab.' }));

      app.textContent = '';
      document.body.classList.remove('nav-open');
      app.appendChild(qualityBanner(data));
      if (route.name === 'runs' || route.name === 'run') {
        if (route.id && byId[route.id]) app.appendChild(runDetail(byId[route.id], data));
        else { app.appendChild(title('Release runs', 'Every pipeline, newest first. Select a row to inspect that run.')); app.appendChild(runsTable(data)); }
      } else if (route.name === 'people') {
        app.appendChild(route.arg ? personView(route.arg, data, byId) : peopleView(data));
      } else if (route.name === 'models') {
        app.appendChild(title('Models and metrics', 'Each model file the gate has seen, identified by SHA-256.')); app.appendChild(models(data));
      } else if (route.name === 'duo') {
        app.appendChild(title('Duo assessments', 'Recorded advisory assessments next to the Witness result.')); app.appendChild(duo(data));
      } else {
        app.appendChild(title('Release proof', 'Does the model in the release image match the model the evidence was produced for?'));
        app.appendChild(latestPanel(data, byId));
        app.appendChild(proofChain(data, byId));
        app.appendChild(coverageStrip(data));
        app.appendChild(overview(data));
      }
      app.appendChild(footer(data));
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', draw);
    draw();
  }

  function title(text, sub) {
    return h('div', { class: 'pagehead' }, [h('h1', { text: text }), sub ? h('p', { class: 'muted', text: sub }) : null,
      SNAPSHOT ? h('p', { class: 'snap', text: SNAPSHOT }) : null]);
  }

  function qualityBanner(data) {
    var q = data.data_quality;
    var issues = q.no_decision > 0 || q.running > 0;
    var text = q.valid_runs + ' valid runs analysed. ' +
      q.no_decision + ' without a retained Witness artifact' + (q.no_decision ? ' (excluded from analysis)' : '') + '. ' +
      q.out_of_scope + ' non-release pipelines (Duo flow, scheduled dashboard refreshes, test probes) are not counted. ' +
      (q.running ? q.running + ' still running. ' : '') +
      'Counts are pipeline runs, so repeats of one scenario are included.';
    var banner = h('div', { class: 'notice' + (issues ? ' warn' : ''), role: 'note' }, [
      h('b', { text: issues ? 'Data quality notice: ' : 'Data quality: ' }), text
    ]);
    if (!data.snapshot) return h('div', { class: 'notices' }, [banner]);
    var snap = h('div', { class: 'notice snapshot', role: 'note' }, [
      h('b', { text: 'Static snapshot, taken ' + data.snapshot.date + '. ' }),
      'Not live data: every value comes from evidence files saved on that date from ',
      h('a', { href: data.snapshot.project_url, target: '_blank', rel: 'noopener', text: 'the GitLab project ↗' }),
      '. Each run has "Verify at source" links: a saved copy you can view, and the live GitLab artifact to download and compare.'
    ]);
    return h('div', { class: 'notices' }, [snap, banner]);
  }

  // ---- Compact decision panel --------------------------------------------
  function decisionLine(run) {
    var th = run.thresholds || {}, m = run.metrics || {}, codes = run.reason_codes || [];
    if (run.outcome === 'released_eligible' || run.outcome === 'unexpected_pass') {
      var parts = ['Model hash matches the evidence'];
      if (m.accuracy != null && th.minimum_accuracy != null) parts.push('accuracy ' + num(m.accuracy) + ' ≥ ' + th.minimum_accuracy);
      if (m.fairness_gap != null && th.maximum_fairness_gap != null) parts.push('fairness gap ' + num(m.fairness_gap) + ' ≤ ' + th.maximum_fairness_gap);
      return parts.join(' · ') + '. A person must still approve production.';
    }
    var c = codes[0];
    if (c === 'FAIRNESS_GAP_EXCEEDED') return num(m.fairness_gap) + ' observed > ' + (th.maximum_fairness_gap != null ? th.maximum_fairness_gap : '?') + ' allowed (equal opportunity difference). Deployment was skipped.';
    if (c === 'ACCURACY_BELOW_THRESHOLD') return num(m.accuracy) + ' observed < ' + (th.minimum_accuracy != null ? th.minimum_accuracy : '?') + ' required. Deployment was skipped.';
    if (c === 'MODEL_HASH_MISMATCH') return 'The evaluated model and the release-image model are different. Deployment was skipped.';
    if (c === 'IMAGE_DIGEST_MISMATCH') return 'The release image is not the image the evidence was produced for. Deployment was skipped.';
    if (!run.has_decision) return 'No Witness decision was retained for this run.';
    return 'The release was blocked. Deployment was skipped.';
  }

  // A command a reader can copy and run. Clipboard access can be refused (file://, old browsers), so it falls back to selecting.
  function copyBox(cmd, label) {
    var code = h('code', { text: cmd });
    var btn = h('button', { type: 'button', class: 'copy', text: 'Copy', 'aria-label': 'Copy ' + (label || 'command') });
    btn.addEventListener('click', function () {
      function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cmd).then(done, function () { selectText(code); });
      else selectText(code);
    });
    function selectText(node) { var r = document.createRange(); r.selectNodeContents(node); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    return h('div', { class: 'cmd' }, [code, btn]);
  }

  // Signed row: green only when the pipeline verified its own signature and a Rekor log entry exists.
  function signedRow(run) {
    var sig = run.signature && run.signature.evidence;
    var ok = !!(sig && sig.signed && sig.rekor && sig.rekor.log_index != null);
    var head = h('div', { class: 'srow' }, [h('span', { class: 'lbl', text: 'Signature' }),
      h('span', { class: 'chip ' + (ok ? 'ok' : (sig ? 'amber' : 'gray')), text: ok ? 'Signed' : (sig ? 'Signature not verified' : 'Not signed') })]);
    var kids = [head];
    if (ok) {
      kids.push(h('p', { class: 'sub' }, ['Sigstore keyless, GitLab CI identity, logged in Rekor: ',
        h('a', { href: sig.rekor.url, target: '_blank', rel: 'noopener', text: 'log entry #' + sig.rekor.log_index + ' \u2197' }),
        '. The signature proves the evidence came from this pipeline and is unaltered; it does not assert a human reviewed correctness.']));
      kids.push(copyBox(sig.verify_command, 'verify command'));
      kids.push(h('p', { class: 'sub', text: 'Download the two files under Verify at source (the evidence bundle and its signature) into one folder, then run the command.' }));
    } else if (sig) {
      kids.push(h('p', { class: 'sub', text: 'A signature was produced but it did not verify in the pipeline or has no Rekor entry, so it is not shown as signed.' }));
    } else {
      kids.push(h('p', { class: 'sub', text: 'Not signed. Signing runs on main-branch pipelines; runs from before it was added, and non-main runs, have no signature.' }));
    }
    return h('div', { class: 'signed' + (ok ? ' ok' : '') }, kids);
  }

  function provenanceBlock(run) {
    if (!run.provenance) return null;
    var psig = run.signature && run.signature.provenance;
    var ok = !!(psig && psig.signed);
    var body = [h('p', { class: 'sub', text: 'SLSA-style provenance, signed. Self-generated; not a GitLab-native SLSA Level 3 attestation.' })];
    if (ok) body.push(h('p', { class: 'sub' }, ['Signed (Sigstore keyless) and logged in Rekor: ', h('a', { href: psig.rekor.url, target: '_blank', rel: 'noopener', text: 'log entry #' + psig.rekor.log_index + ' \u2197' })]));
    else body.push(h('p', { class: 'sub', text: 'This statement is not shown as signed: no verified signature with a Rekor entry was recorded for it.' }));
    if (ok) body.push(copyBox(psig.verify_command, 'provenance verify command'));
    body.push(h('pre', { class: 'json', text: JSON.stringify(run.provenance, null, 2) }));
    return h('details', { class: 'verify' }, [h('summary', { text: 'Provenance' }), h('div', { class: 'detailbody' }, body)]);
  }

  var CHECK_SVG = function (ok) {
    return s('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      [s('path', { d: ok ? 'M3 8.5l3 3 7-7' : 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })]);
  };

  // A pass-meter: where the observed value sits against the policy limit (tick). Same numbers as the line above it.
  function meter(label, value, limit, kind) {
    var pass = kind === 'min' ? value >= limit : value <= limit;
    var top = kind === 'min' ? 1 : Math.max(limit * 3, value * 1.2);
    var fill = h('i', { class: pass ? '' : 'over' }); fill.style.width = Math.min(100, value / top * 100) + '%';
    var tick = h('u', {}); tick.style.left = (limit / top * 100) + '%';
    var note = kind === 'min' ? (pass ? '\u2265 ' : '< ') + limit + ' required' : (pass ? '\u2264 ' : '> ') + limit + ' allowed';
    return h('div', { class: 'meter' }, [
      h('div', { class: 'mhead' }, [h('b', { text: label }), h('span', { class: 'mval', text: num(value) })]),
      h('div', { class: 'mtrack', role: 'img', 'aria-label': label + ' ' + num(value) + ', limit ' + limit }, [fill, tick]),
      h('div', { class: 'mnote' }, [h('span', { class: pass ? 'okt' : 'badt', text: (pass ? '\u2713 ' : '\u2717 ') + note })])
    ]);
  }

  function decisionPanel(run, data) {
    var blocked = run.outcome === 'expected_block' || run.outcome === 'unexpected_block';
    var unexpected = run.outcome === 'unexpected_block' || run.outcome === 'unexpected_pass';
    var codes = run.reason_codes || [];
    var head = run.outcome === 'released_eligible' || run.outcome === 'unexpected_pass'
      ? 'Release eligible'
      : (blocked ? 'Release blocked' + (codes[0] ? ' \u00b7 ' + (REASON_TITLE[codes[0]] || codes[0]) : '') : (OUTCOME[run.outcome] || {}).label || run.outcome);
    var panel = h('section', { class: 'decision' + (blocked ? ' blocked' : '') + (unexpected ? ' unexpected' : '') });
    var top = h('div', { class: 'dtop' }, [h('p', { class: 'vt', text: head }), chip(run.outcome), trustChip(run)]);
    codes.forEach(function (c) { top.appendChild(h('span', { class: 'chip blocked code', text: c })); });
    panel.appendChild(top);
    panel.appendChild(h('p', { class: 'dline', text: decisionLine(run) }));
    if (run.trust && run.trust !== 'trusted') panel.appendChild(h('p', { class: 'sub', text: TRUST[run.trust].hint + ' Flagged, not deleted: it stays listed with its reason.' }));
    if (run.trust === 'trusted') panel.appendChild(h('p', { class: 'sub', text: TRUST.trusted.hint + ' A person must still approve production.' }));

    var ev = run.evidenced_model_sha256, ob = run.observed_model_sha256;
    if (ev && ob) {
      var differ = diffCount(ev, ob);
      var row = function (label, val, bad) {
        var code = h('code', {});
        code.appendChild(h(bad ? 'mark' : 'span', { text: val.slice(0, 12) }));
        code.appendChild(document.createTextNode(val.slice(12)));
        return h('div', { class: 'hashrow' }, [h('span', { class: 'lbl', text: label }), code]);
      };
      panel.appendChild(h('div', { class: 'verified' }, [
        h('div', { class: 'vhead' + (differ === 0 ? '' : ' bad') }, [CHECK_SVG(differ === 0), differ === 0 ? 'Verified' : 'Mismatch']),
        row('Evaluated (evidence)', ev, differ > 0),
        row('Recomputed from image', ob, differ > 0),
        h('span', { class: 'sub', text: differ === 0 ? 'Identical.' : 'Differ in ' + differ + ' of ' + Math.max(ev.length, ob.length) + ' characters.' })
      ]));
    }
    panel.appendChild(signedRow(run));
    var th = run.thresholds || {}, m = run.metrics || {};
    var meters = [];
    if (m.accuracy != null && th.minimum_accuracy != null) meters.push(meter('Accuracy', m.accuracy, th.minimum_accuracy, 'min'));
    if (m.fairness_gap != null && th.maximum_fairness_gap != null) meters.push(meter('Fairness gap', m.fairness_gap, th.maximum_fairness_gap, 'max'));
    if (meters.length) panel.appendChild(h('div', { class: 'meters' }, meters));

    panel.appendChild(h('p', { class: 'dmeta' }, [h('span', {}, [h('b', { text: 'Triggered by: ' }), who(run.actor, false)]),
      h('span', { text: 'on ' + fmtTime(run.created_at) + ' \u00b7 commit ' + (run.sha || '').slice(0, 8) })]));
    if (run.release_stage) panel.appendChild(stageTracker(run));
    panel.appendChild(h('p', { class: 'dline' }, [h('b', { text: 'Deployment: ' }), run.deploy_job_state ? (DEPLOY[run.deploy_job_state] || run.deploy_job_state) : 'No deploy job recorded.']));
    var links = h('div', { class: 'links' });
    if (run.has_decision) links.appendChild(h('a', { href: 'runs/' + run.id + '/', text: 'Evidence page' }));
    if (run.witness_job_url) links.appendChild(h('a', { href: run.witness_job_url, target: '_blank', rel: 'noopener', text: 'Witness log in GitLab \u2197' }));
    links.appendChild(h('a', { href: run.web_url, target: '_blank', rel: 'noopener', text: 'Pipeline in GitLab \u2197' }));
    if (run.mr_iid) links.appendChild(h('a', { href: data.project_url + '/-/merge_requests/' + run.mr_iid, target: '_blank', rel: 'noopener', text: 'Merge request !' + run.mr_iid + ' \u2197' }));
    panel.appendChild(links);
    if (run.evidence_links && run.evidence_links.length) {
      var src = h('div', { class: 'links' });
      run.evidence_links.forEach(function (l) {
        if (l.view_url) src.appendChild(h('a', { href: l.view_url, target: '_blank', rel: 'noopener', title: 'Saved copy of ' + l.file + ' in the repository (opens in the browser)', text: 'View ' + l.file + ' \u2192' }));
        src.appendChild(h('a', { href: l.url, target: '_blank', rel: 'noopener', title: 'Live GitLab artifact, job ' + l.job_id + ' (downloads the file)', text: 'Download raw ' + l.file + ' \u2193' }));
      });
      panel.appendChild(h('details', { class: 'verify' }, [h('summary', { text: 'Verify at source' }), src]));
    }
    var prov = provenanceBlock(run);
    if (prov) panel.appendChild(prov);
    return panel;
  }

  // The most recent run of each scenario, selectable.
  function latestPanel(data, byId) {
    var tabs = [
      { key: 'b-stale', label: 'Stale evidence', id: data.latest_by_scenario['b-stale'] },
      { key: 'c', label: 'Fairness regression', id: data.latest_by_scenario.c },
      { key: 'regression', label: 'Injected regression', id: data.latest_by_scenario.regression },
      { key: 'd', label: 'Passing release', id: data.latest_by_scenario.d },
      { key: 'a', label: 'Baseline (A)', id: data.latest_by_scenario.a }
    ];
    Object.keys(data.latest_by_mr).forEach(function (iid) { tabs.push({ key: 'mr' + iid, label: 'Merge request !' + iid, id: data.latest_by_mr[iid] }); });
    var first = tabs.filter(function (t) { return t.id; })[0];
    var wrap = h('div', {}), body = h('div', {}), buttons = [];
    var tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Latest run by scenario' });
    function show(tab) {
      buttons.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.key === tab.key ? 'true' : 'false'); });
      body.textContent = '';
      body.appendChild(decisionPanel(byId[tab.id], data));
      body.appendChild(h('p', { class: 'sub', text: 'Latest run of this scenario, ' + fmtTime(byId[tab.id].created_at) + '. To inspect a specific run, open Release runs.' }));
    }
    tabs.forEach(function (tab) {
      var b = h('button', { role: 'tab', type: 'button', text: tab.label, 'data-key': tab.key });
      if (!tab.id) { b.disabled = true; b.title = 'No CI run recorded for this scenario yet'; }
      b.addEventListener('click', function () { show(tab); });
      buttons.push(b); tablist.appendChild(b);
    });
    wrap.appendChild(tablist); wrap.appendChild(body);
    if (first) show(first); else body.appendChild(h('p', { class: 'muted', text: 'No release run recorded yet.' }));
    return wrap;
  }

  // ---- One run: decision, explanation, checks, identity, sources ---------
  function runDetail(run, data) {
    var el = h('div', {});
    el.appendChild(h('p', { class: 'crumb' }, [h('a', { href: lastRunsHash, text: 'Release runs' }), ' / pipeline ' + run.id]));
    el.appendChild(title('Pipeline ' + run.id, (SCENARIO[run.scenario] || run.scenario || 'Merge request') + ' · ' + fmtTime(run.created_at)));
    el.appendChild(decisionPanel(run, data));

    var checks = run.checks || {};
    var keys = Object.keys(checks);
    var cs = sec('Policy checks', keys.length ? 'Each check is recomputed by the Witness.' : 'No Witness decision was retained, so no checks are available.');
    if (keys.length) {
      var grid = h('div', { class: 'checks' });
      keys.forEach(function (k) {
        var ok = checks[k] === 'passed';
        grid.appendChild(h('div', { class: 'check' + (ok ? '' : ' fail') }, [h('b', { text: k.replace(/_/g, ' ') }), h('span', { class: 'chip ' + (ok ? 'ok' : 'block'), text: ok ? 'PASS' : (checks[k] === 'skipped' ? 'SKIPPED' : 'FAIL') })]));
      });
      cs.appendChild(grid);
    }
    el.appendChild(cs);

    var th = run.thresholds || {}, m = run.metrics || {};
    var ms = sec('Metrics against policy');
    ms.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [
      h('thead', {}, [h('tr', {}, ['Metric', 'Observed', 'Policy'].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', {}, [
        h('tr', {}, [h('td', { text: 'Accuracy' }), h('td', { text: num(m.accuracy) }), h('td', { text: th.minimum_accuracy != null ? 'at least ' + th.minimum_accuracy : NOT_RECORDED })]),
        h('tr', {}, [h('td', { text: 'Fairness gap' }), h('td', { text: num(m.fairness_gap) }), h('td', { text: th.maximum_fairness_gap != null ? 'at most ' + th.maximum_fairness_gap : NOT_RECORDED })])
      ])])]));
    el.appendChild(ms);

    var id = sec('Artifact identity');
    id.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [h('tbody', {}, [
      h('tr', {}, [h('td', { text: 'Commit' }), h('td', {}, [h('code', { text: run.sha || NOT_RECORDED })])]),
      h('tr', {}, [h('td', { text: 'Evaluated model hash' }), h('td', {}, [h('code', { text: run.evidenced_model_sha256 || NOT_RECORDED })])]),
      h('tr', {}, [h('td', { text: 'Recomputed from image' }), h('td', {}, [h('code', { text: run.observed_model_sha256 || NOT_RECORDED })])])
    ])])]));
    el.appendChild(id);

    var issues = ((data.work || {}).issues || []).filter(function (i) { return i.pipeline_id === run.id; });
    var steps = sec('Investigation, approval and deployment', 'Steps that have not happened stay visibly pending.');
    var inv = issues.length ? h('a', { href: issues[0].web_url, target: '_blank', rel: 'noopener', text: '#' + issues[0].iid + ' ' + issues[0].title + ' ↗' }) : 'Pending: no investigation issue is linked to this pipeline.';
    var dep = run.deployment;
    var approval = 'Pending: not recorded.';
    if (dep && dep.approval && typeof dep.approval === 'object' && dep.approval.approvals && dep.approval.approvals.length) {
      approval = dep.approval.approvals.map(function (a) { return '@' + a.username + ' ' + a.status; }).join(', ') + ' (from GitLab\'s approval record)';
    } else if (dep) approval = 'not recorded' + (dep.executed_by ? '. The job was executed by @' + dep.executed_by + ', which is not an approval.' : '.');
    var runtime = 'Pending: no deployment has been verified for this run.';
    var rv = run.runtime_verification;
    if (rv && rv.verified === true) runtime = RUNTIME_CAPTION;
    else if (rv && rv.verified === false) runtime = rv.note || 'Runtime verification failed.';
    else if (dep && dep.mock) runtime = 'Not applicable: the release was recorded without deploying a service, so nothing running was verified.';
    else if (dep && dep.production_verified) runtime = 'Verified: the running service reported the evidenced model hash and passed the smoke checks.';
    else if (dep && dep.failure) runtime = 'Failed at ' + dep.failure.stage + (dep.previous_revision_still_serving ? '; the previous revision is still serving.' : '.');
    steps.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [h('tbody', {}, [
      h('tr', {}, [h('td', { text: 'Duo investigation' }), h('td', {}, [inv])]),
      h('tr', {}, [h('td', { text: 'Human approval' }), h('td', { text: approval })]),
      h('tr', {}, [h('td', { text: 'Runtime verification' }), h('td', { text: runtime })])
    ])])]));
    el.appendChild(steps);
    return el;
  }

  // ---- Overview ----------------------------------------------------------
  // One case from blocked pipeline to verified runtime. Missing links stay pending; nothing is inferred.
  function proofChain(data, byId) {
    var el = sec('Proof chain', 'Blocked pipeline, investigation, repair, corrected run, approval, deployment and runtime check, from real GitLab records.');
    var chains = data.chains || [];
    function link(href, text) { return h('a', { href: href, target: '_blank', rel: 'noopener', text: text + ' ↗' }); }
    function row(label, content, done, n) {
      return h('li', { class: done ? 'done' : '' }, [
        h('span', { class: 'node', 'aria-hidden': 'true' }, [done ? CHECK_SVG(true) : String(n)]),
        h('div', {}, [h('div', { class: 'st', text: label }), h('div', { class: 'sd' }, [content])]),
        h('span', { class: 'chip ' + (done ? 'ok' : 'gray'), text: done ? 'RECORDED' : 'PENDING' })
      ]);
    }
    function table(c) {
      var blocked = c ? byId[c.blocked_run] : null, corrected = c && c.corrected_run ? byId[c.corrected_run] : null;
      var release = c && c.release_run ? byId[c.release_run] : null;
      var dep = release && release.deployment;
      var approval = dep && dep.approval && typeof dep.approval === 'object' && dep.approval.approvals && dep.approval.approvals.length
        ? dep.approval.approvals.map(function (a) { return '@' + a.username + ' (' + a.status + ')'; }).join(', ') : null;
      return h('ol', { class: 'vtl' }, [
        row('Blocked pipeline', blocked ? h('span', {}, [h('a', { href: '#/run/' + blocked.id, text: 'Pipeline ' + blocked.id }), ' · ' + (c.blocked_reasons || []).join(', ')]) : 'No blocked pipeline linked yet.', !!blocked, 1),
        row('Duo investigation', c ? h('span', {}, [link(c.issue.web_url, '#' + c.issue.iid + ' ' + c.issue.title), ' · session ' + (c.issue.session || 'not recorded')]) : 'No investigation issue recorded.', !!c, 2),
        row('Repair merge request', c && c.repair_mr ? h('span', {}, [link(c.repair_mr.web_url, '!' + c.repair_mr.iid + ' ' + c.repair_mr.title + (c.repair_mr.draft ? ' (draft)' : '')), ' · session ' + (c.repair_mr.session || 'not recorded')]) : 'No repair merge request recorded.', !!(c && c.repair_mr), 3),
        row('Corrected pipeline', corrected ? h('span', {}, [h('a', { href: '#/run/' + corrected.id, text: 'Pipeline ' + corrected.id }), ' · ' + OUTCOME[corrected.outcome].label + ' (a new run; the blocked result is unchanged)']) : 'No corrected pipeline yet.', !!corrected, 4),
        row('Approval record', approval || 'not recorded', !!approval, 5),
        row('Deployment', dep ? (dep.mock ? 'Release recorded, nothing deployed (receipt marked mock), by ' + (dep.executed_by || 'not recorded') : (dep.promoted_revision ? 'Revision ' + dep.promoted_revision : 'Deployment attempted')) : 'No deployment recorded.', !!(dep && !dep.mock && dep.promoted_revision), 6),
        row('Runtime verification', release ? stageTracker(release, true) : 'Pending: no release run with a deployment is linked.', !!(release && (release.release_stage === 'runtime_verified' || release.release_stage === 'artifact_verified')), 7)
      ]);
    }
    el.appendChild(h('p', { class: 'sub' }, [h('a', { href: 'proof-chain.json', text: 'Machine-readable export (proof-chain.json)' }), ' · no sign-in needed; job logs and merge request notes in GitLab may need one.']));
    if (!chains.length) {
      el.appendChild(h('p', { class: 'muted', text: 'No investigation has been recorded yet, so every step below is pending.' }));
      el.appendChild(table(null));
    } else chains.forEach(function (c) { el.appendChild(table(c)); });
    return el;
  }

  // Which GitLab features were actually used, each linked to its real page. Listed only when a recorded run or merge request proves it.
  function coverageStrip(data) {
    var el = sec('GitLab coverage', 'Only stages that actually ran are listed, and each links to its real GitLab page. A feature that is configured but has not run does not appear.');
    var items = data.coverage || [];
    if (!items.length) { el.appendChild(h('p', { class: 'muted', text: 'No GitLab feature usage is recorded yet.' })); return el; }
    var strip = h('div', { class: 'covstrip' });
    items.forEach(function (i) {
      strip.appendChild(h('a', { class: 'cov', href: i.url, target: '_blank', rel: 'noopener', title: i.evidence }, [
        h('span', { class: 'chip ok', text: i.label }), h('span', { class: 'sub', text: i.evidence + ' \u2197' })]));
    });
    el.appendChild(strip);
    return el;
  }

  function overview(data) {
    var k = data.kpis;
    var el = sec('Overview', 'Pipeline runs classified by the Witness decision, not by pipeline colour. A red pipeline that blocked for the expected reason is a correct result. Blocked runs are flagged, not deleted: they stay listed with their reason (evidence artifacts of recent runs are kept without expiry; older ones expire 90 days after the run).');
    function kpi(label, value, cls) { return h('div', { class: 'kpi ' + (cls || '') }, [h('b', { text: String(value) }), h('span', { text: label })]); }
    el.appendChild(h('div', { class: 'kpis' }, [
      kpi('valid runs', k.valid_runs),
      kpi('correct blocks', k.correct_blocks, 'blocked'),
      kpi('unexpected blocks', k.unexpected_blocks, k.unexpected_blocks ? 'danger' : ''),
      kpi('eligible releases', k.eligible_releases, 'ok'),
      kpi('median Witness time', fmtSec(k.median_witness_seconds)),
      kpi('median pipeline time', fmtSec(k.median_pipeline_seconds))
    ]));
    var st = k.stages || {};
    el.appendChild(h('div', { class: 'kpis', style: 'margin-top:10px' }, [
      kpi('Eligible', st.eligible || 0), kpi('Awaiting approval', st.awaiting_approval || 0),
      kpi('Release recorded', st.deployed_mock || 0, 'gray'), kpi('Artifact digest verified', st.artifact_verified || 0, st.artifact_verified ? 'ok' : ''), kpi('Deployed (real service)', st.deployed || 0),
      kpi('Runtime verified', st.runtime_verified || 0, st.runtime_verified ? 'ok' : '')
    ]));
    if (k.unexpected_passes) el.appendChild(h('p', { class: 'notice warn', text: k.unexpected_passes + ' run(s) of a negative scenario passed the Witness. Investigate.' }));

    el.appendChild(h('h3', { text: 'Outcome timeline (oldest to newest)' }));
    el.appendChild(timeline(data));
    el.appendChild(h('h3', { text: 'Reason codes across valid runs' }));
    el.appendChild(reasonBars(data));
    el.appendChild(h('h3', { text: 'Scenario by outcome' }));
    el.appendChild(matrix(data));
    el.appendChild(h('h3', { text: 'Where pipeline time goes (median of valid runs)' }));
    el.appendChild(stageBar(data));
    el.appendChild(reverifySection(data));
    return el;
  }

  // Scheduled re-verification of the last signed release on the fixed holdout. Not production-traffic monitoring.
  function reverifySection(data) {
    var wrap = h('div', {});
    wrap.appendChild(h('h3', { text: 'Scheduled re-verification' }));
    wrap.appendChild(h('p', { class: 'sub', text: 'Scheduled re-verification on a fixed holdout \u2014 not live production-traffic monitoring. It re-checks the published model against the signed evidence and the policy; on an unchanged model and holdout the numbers cannot move.' }));
    var rv = data.reverification || {};
    if (!rv.latest) {
      wrap.appendChild(h('p', { class: 'notice', text: 'No scheduled re-verification has run yet. It runs only from a pipeline schedule on main (see docs/SETUP.md).' }));
      return wrap;
    }
    var l = rv.latest, m = l.metrics || {}, b = l.signed_baseline || {};
    wrap.appendChild(h('p', { class: 'dline' }, [h('span', { class: 'chip ' + (l.flagged ? 'danger' : 'ok'), text: l.flagged ? 'Flagged' : 'Within thresholds' }), ' ',
      h('a', { href: l.web_url, target: '_blank', rel: 'noopener', text: 'Pipeline ' + l.run_id + ' \u2197' }), ' \u00b7 ' + fmtTime(l.created_at) + ' \u00b7 ' + rv.count + ' run' + (rv.count === 1 ? '' : 's') + ', ' + rv.flagged + ' flagged']));
    wrap.appendChild(h('p', { class: 'sub', text: 'Accuracy ' + num(m.accuracy) + ' (signed baseline ' + num(b.accuracy) + ') \u00b7 fairness gap ' + num(m.fairness_gap) + ' (signed baseline ' + num(b.fairness_gap) + ')' }));
    if (l.flagged) wrap.appendChild(h('ul', {}, (l.flags || []).map(function (f) { return h('li', { text: f }); })));
    return wrap;
  }

  function timeline(data) {
    var runs = data.runs.filter(function (r) { return OUTCOME[r.outcome] && r.outcome !== 'out_of_scope'; }).slice().reverse();
    var cell = 15, gap = 3, w = runs.length * (cell + gap) + gap;
    var svg = s('svg', { viewBox: '0 0 ' + Math.max(w, 40) + ' 30', width: Math.max(w, 40), height: 30, role: 'img', 'aria-label': 'Outcome of each run, oldest to newest' });
    runs.forEach(function (r, i) {
      var cls = 's-' + OUTCOME[r.outcome].cls;
      var rect = s('rect', { x: gap + i * (cell + gap), y: 3, width: cell, height: 24, rx: 2, class: cls });
      rect.appendChild(s('title', {})).textContent = fmtTime(r.created_at) + ' | ' + (SCENARIO[r.scenario] || r.scenario || 'merge request') + ' | ' + OUTCOME[r.outcome].label;
      var a = s('a', { href: r.has_decision ? 'runs/' + r.id + '/' : r.web_url }, [rect]);
      svg.appendChild(a);
    });
    var legend = h('div', { class: 'legend' });
    [['ok', 'Release eligible'], ['blocked', 'Blocked (expected)'], ['danger', 'Unexpected'], ['gray', 'No decision']].forEach(function (p) {
      var sw = h('i', {}); sw.style.background = { ok: 'var(--pass)', blocked: 'var(--fail)', danger: 'var(--danger)', gray: 'var(--line)' }[p[0]];
      legend.appendChild(h('span', {}, [sw, p[1]]));
    });
    return h('div', { class: 'tablewrap' }, [svg, legend]);
  }

  function reasonBars(data) {
    var codes = Object.keys(data.reason_codes).sort(function (a, b) { return data.reason_codes[b] - data.reason_codes[a]; });
    if (!codes.length) return h('p', { class: 'muted', text: 'No blocked runs recorded.' });
    var max = data.reason_codes[codes[0]];
    var grid = h('div', { class: 'bars' });
    codes.forEach(function (c) {
      var fill = h('i', {}); fill.style.width = (data.reason_codes[c] / max * 100) + '%';
      grid.appendChild(h('code', { text: c }));
      grid.appendChild(h('div', { class: 'track' }, [fill]));
      grid.appendChild(h('span', { text: String(data.reason_codes[c]) }));
    });
    return grid;
  }

  function matrix(data) {
    var cols = ['released_eligible', 'expected_block', 'unexpected_block', 'unexpected_pass'];
    var head = h('tr', {}, [h('th', { text: 'Scenario' })].concat(cols.map(function (c) { return h('th', { text: OUTCOME[c].label }); })));
    var rows = ['a', 'b-stale', 'c', 'd', 'regression'].map(function (sc) {
      var row = data.scenario_matrix[sc];
      var cells = [h('td', { text: SCENARIO[sc] })];
      if (!row) { cells.push(h('td', { colspan: String(cols.length), class: 'muted', text: 'No CI runs recorded for this scenario' })); }
      else cols.forEach(function (c) { cells.push(h('td', { text: row[c] ? String(row[c]) : '-' })); });
      return h('tr', {}, cells);
    });
    return h('div', { class: 'tablewrap' }, [h('table', {}, [h('thead', {}, [head]), h('tbody', {}, rows)])]);
  }

  function stageBar(data) {
    var stages = [['package', 'Package'], ['evaluate', 'Evaluate'], ['secure', 'Security scan'], ['bind', 'Bind'], ['witness', 'Witness']];
    var colors = ['#0c365d', '#0d6b66', '#7aa5ff', '#e3b341', '#1b65fb'];   // navy, teal, light blue, amber, blue
    var valid = data.runs.filter(function (r) { return r.has_decision; });
    var med = stages.map(function (st) { return median(valid.map(function (r) { return r.stage_seconds[st[0]]; })); });
    var total = med.reduce(function (a, v) { return a + (v || 0); }, 0);
    if (!total) return h('p', { class: 'muted', text: 'Stage durations: ' + NOT_RECORDED + '.' });
    var stack = h('div', { class: 'stack', role: 'img', 'aria-label': 'Median stage durations' });
    var legend = h('div', { class: 'legend' });
    stages.forEach(function (st, i) {
      if (!med[i]) return;
      var seg = h('span', { title: st[1] + ': ' + fmtSec(med[i]) }); seg.style.width = (med[i] / total * 100) + '%'; seg.style.background = colors[i];
      stack.appendChild(seg);
      var sw = h('i', {}); sw.style.background = colors[i];
      legend.appendChild(h('span', {}, [sw, st[1] + ' ' + fmtSec(med[i])]));
    });
    return h('div', {}, [stack, legend]);
  }

  // ---- Runs table --------------------------------------------------------
  function runsTable(data, fixedRuns, fixedQuery) {
    var el = sec('Runs', 'Every pipeline, newest first. Filters are kept in the address, so a view can be shared.');
    var q = fixedQuery || parseRoute().query;
    var pool = fixedRuns || data.runs;
    var people = (data.people || []).map(function (p) { return p.profile; });
    var holder = h('div', { class: 'tablewrap' });
    var more = h('button', { class: 'more', type: 'button', text: 'Show more' });
    var count = h('span', { class: 'sub' });

    function go(next) { if (!fixedQuery) location.hash = hashFor('runs', next); }
    function select(label, key, options) {
      var sel = h('select', { 'aria-label': label }, [h('option', { value: '', text: label })].concat(
        options.map(function (o) { return h('option', { value: o[0], text: o[1] }); })));
      sel.value = q[key] || '';
      sel.addEventListener('change', function () { var next = Object.assign({}, q); next[key] = sel.value; delete next.n; go(next); });
      return sel;
    }
    var filters = h('div', { class: 'filters' });
    var search = h('input', { type: 'search', placeholder: 'Search pipeline, ref, commit, reason', 'aria-label': 'Search runs', class: 'search' });
    search.value = q.q || '';
    search.addEventListener('change', function () { var next = Object.assign({}, q); next.q = search.value.trim(); delete next.n; go(next); });
    filters.appendChild(search);
    filters.appendChild(select('All outcomes', 'outcome', Object.keys(OUTCOME).filter(function (k) { return k !== 'out_of_scope'; }).map(function (k) { return [k, OUTCOME[k].label]; })));
    filters.appendChild(select('All scenarios', 'scenario', Object.keys(SCENARIO).map(function (k) { return [k, SCENARIO[k]]; })));
    if (people.length && !fixedQuery) filters.appendChild(select('All contributors', 'who', people.map(function (u) { return [u.username, '@' + u.username]; })));
    var clear = h('a', { href: '#/runs', text: 'Clear filters' });
    var active = ['q', 'outcome', 'scenario', 'who'].some(function (k) { return q[k]; });
    if (active && !fixedQuery) filters.appendChild(clear);
    filters.appendChild(count);
    el.appendChild(filters);
    el.appendChild(holder);
    el.appendChild(more);

    var owned = null;
    if (q.who) {
      var person = (data.people || []).filter(function (p) { return p.profile.username === q.who; })[0];
      owned = person ? person.run_ids : [];
    }
    var needle = (q.q || '').toLowerCase();
    var rows = pool.filter(function (r) {
      if (r.outcome === 'out_of_scope') return false;
      if (q.scenario && r.scenario !== q.scenario) return false;
      if (q.outcome && r.outcome !== q.outcome) return false;
      if (owned && owned.indexOf(r.id) < 0) return false;
      if (needle) {
        var hay = [String(r.id), r.ref, r.sha, (r.reason_codes || []).join(' '), r.mr_iid ? 'mr !' + r.mr_iid : ''].join(' ').toLowerCase();
        if (hay.indexOf(needle) < 0) return false;
      }
      return true;
    });
    var limit = Number(q.n) || 25;
    var shown = rows.slice(0, limit);
    var head = h('tr', {}, ['Pipeline', 'Time (UTC)', 'By', 'Ref', 'Outcome', 'Trust', 'Reason', 'Deploy', 'Links'].map(function (t) { return h('th', { text: t }); }));
    var body = shown.map(function (r) {
      var links = h('span', {});
      if (r.has_decision) links.appendChild(h('a', { href: 'runs/' + r.id + '/', text: 'Evidence' }));
      else links.appendChild(h('span', { class: 'muted', text: 'No evidence' }));
      links.appendChild(document.createTextNode(' · '));
      links.appendChild(h('a', { href: r.web_url, target: '_blank', rel: 'noopener', text: 'GitLab ↗' }));
      var human = r.actor && !r.actor.kind && (data.people || []).some(function (p) { return p.profile.username === r.actor.username; });
      var triggered = h('td', { class: 'nw' }, [who(r.actor, false)]);
      return h('tr', {}, [
        h('td', { class: 'nw' }, [h('a', { class: 'mono', href: '#/run/' + r.id, text: '#' + r.id })]),
        h('td', { class: 'nw', title: fmtTime(r.created_at), text: r.created_at ? r.created_at.slice(5, 16).replace('T', ' ') : NOT_RECORDED }),
        triggered,
        h('td', { class: 'nw' }, [h('code', { text: r.mr_iid ? 'MR !' + r.mr_iid : r.ref })]),
        h('td', {}, [chip(r.outcome)]),
        h('td', {}, [trustChip(r)]),
        h('td', {}, [h('code', { text: (r.reason_codes && r.reason_codes.length) ? r.reason_codes.join(', ') : (r.has_decision ? 'none' : NOT_RECORDED) })]),
        h('td', { text: r.deploy_job_state || NOT_RECORDED }),
        h('td', {}, [links])
      ]);
    });
    holder.appendChild(h('table', {}, [h('thead', {}, [head]), h('tbody', {}, body)]));
    if (!rows.length) holder.appendChild(h('p', { class: 'muted', text: 'No runs match these filters.' }));
    count.textContent = rows.length + ' matching run' + (rows.length === 1 ? '' : 's') + (shown.length < rows.length ? ', showing ' + shown.length : '');
    more.style.display = shown.length < rows.length ? '' : 'none';
    more.addEventListener('click', function () { var next = Object.assign({}, q); next.n = String(limit + 25); go(next); });
    return el;
  }

  // ---- Contributors: ownership (MR author/assignee, issue assignee), not pipeline triggerer ----
  function peopleView(data) {
    var el = h('div', {});
    el.appendChild(title('Contributors', 'People who own merge requests or investigations. Pipeline triggerer is shown separately in Release runs.'));
    var people = data.people || [];
    var s1 = sec('People with linked work');
    if (!people.length) {
      s1.appendChild(h('p', { class: 'muted', text: 'No human-owned work is recorded yet. Every merge request so far was authored by an automation account, and no investigation issue has been assigned to a person. Contributors appear here when work is owned by a person.' }));
    } else {
      var rows = people.map(function (p) {
        return h('tr', {}, [
          h('td', {}, [who(p.profile, false)]),
          h('td', { text: String(p.mrs.length) }), h('td', { text: String(p.issues.length) }), h('td', { text: String(p.run_ids.length) }),
          h('td', {}, [h('a', { href: hashFor('people/' + p.profile.username), text: 'View related work' })])
        ]);
      });
      s1.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [
        h('thead', {}, [h('tr', {}, ['Person', 'Merge requests', 'Investigations', 'Linked runs', ''].map(function (t) { return h('th', { text: t }); }))]),
        h('tbody', {}, rows)])]));
    }
    el.appendChild(s1);
    return el;
  }

  function personView(username, data, byId) {
    var el = h('div', {});
    var person = (data.people || []).filter(function (p) { return p.profile.username === username; })[0];
    el.appendChild(h('p', { class: 'crumb' }, [h('a', { href: '#/people', text: 'Contributors' }), ' / @' + username]));
    el.appendChild(title('Work related to @' + username, 'A public view of work this person owns. It is not a private dashboard.'));
    if (!person) { el.appendChild(sec('No linked work', 'No merge request or investigation owned by @' + username + ' is recorded.')); return el; }
    var runs = person.run_ids.map(function (id) { return byId[id]; }).filter(Boolean);
    var blocked = runs.filter(function (r) { return r.outcome === 'expected_block' || r.outcome === 'unexpected_block'; }).length;
    var eligible = runs.filter(function (r) { return r.outcome === 'released_eligible'; }).length;
    var kp = h('div', { class: 'kpis' });
    [['Linked runs', runs.length], ['Blocked', blocked], ['Release eligible', eligible], ['Merge requests', person.mrs.length], ['Investigations', person.issues.length]].forEach(function (k) {
      kp.appendChild(h('div', { class: 'kpi' }, [h('b', { text: String(k[1]) }), h('span', { text: k[0] })]));
    });
    var s1 = sec('Counts for this person only', 'Computed from the runs linked to their work. Project-wide totals are on Overview.');
    s1.appendChild(kp);
    el.appendChild(s1);
    var own = (data.work.merge_requests.filter(function (m) { return person.mrs.indexOf(m.iid) >= 0; }));
    var s2 = sec('Merge requests');
    if (!own.length) s2.appendChild(h('p', { class: 'muted', text: 'None.' }));
    own.forEach(function (m) { s2.appendChild(h('p', {}, [h('a', { href: m.web_url, target: '_blank', rel: 'noopener', text: '!' + m.iid + ' ' + m.title + ' ↗' })])); });
    el.appendChild(s2);
    var ownIssues = data.work.issues.filter(function (i) { return person.issues.indexOf(i.iid) >= 0; });
    var s3 = sec('Investigations');
    if (!ownIssues.length) s3.appendChild(h('p', { class: 'muted', text: 'None.' }));
    ownIssues.forEach(function (i) { s3.appendChild(h('p', {}, [h('a', { href: i.web_url, target: '_blank', rel: 'noopener', text: '#' + i.iid + ' ' + i.title + ' ↗' })])); });
    el.appendChild(s3);
    el.appendChild(runsTable(data, runs, { fixed: '1' }));
    return el;
  }

  // ---- Models ------------------------------------------------------------
  function models(data) {
    var el = sec('Models and metrics', 'Each distinct model file the gate has seen, identified by its SHA-256. Metrics come from the evaluation job that produced the evidence.');
    var thresholds = null;
    data.runs.some(function (r) { if (r.thresholds) { thresholds = r.thresholds; return true; } return false; });
    var evaluated = data.models.filter(function (m) { return m.metrics && m.metrics.accuracy !== null; });
    var observedOnly = data.models.filter(function (m) { return !m.metrics; });

    var head = h('tr', {}, ['Variant', 'Model hash', 'Accuracy', 'Fairness gap', 'Evidenced in', 'Observed in'].map(function (t) { return h('th', { text: t }); }));
    var rows = data.models.map(function (m) {
      var variant = m.variants.length ? m.variants.join(', ') : 'observed only';
      var accBad = thresholds && m.metrics && m.metrics.accuracy < thresholds.minimum_accuracy;
      var gapBad = thresholds && m.metrics && m.metrics.fairness_gap > thresholds.maximum_fairness_gap;
      return h('tr', {}, [
        h('td', { text: variant }),
        h('td', {}, [h('code', { text: m.sha256.slice(0, 16) + '…', title: m.sha256 })]),
        h('td', {}, [h('span', { class: accBad ? 'chip block' : '', text: m.metrics ? num(m.metrics.accuracy) : 'not evaluated in CI' })]),
        h('td', {}, [h('span', { class: gapBad ? 'chip block' : '', text: m.metrics ? num(m.metrics.fairness_gap) : 'not evaluated in CI' })]),
        h('td', { text: m.evidenced_in + ' runs' }),
        h('td', { text: m.observed_in + ' runs' })
      ]);
    });
    el.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [h('thead', {}, [head]), h('tbody', {}, rows)])]));
    if (observedOnly.length) {
      el.appendChild(h('p', { class: 'sub', style: 'margin-top:8px', text: observedOnly.length + ' model hash(es) were only ever observed inside a release image and never evaluated in CI, so no metrics exist for them here. That is the stale-evidence case: the evidence describes a different model.' }));
    }

    if (evaluated.length && thresholds) {
      el.appendChild(h('h3', { text: 'Accuracy vs fairness gap, against the policy' }));
      el.appendChild(scatter(evaluated, thresholds));
      el.appendChild(h('h3', { text: 'True-positive rate by group (equal opportunity)' }));
      el.appendChild(groupBars(evaluated, thresholds));
      el.appendChild(h('p', { class: 'sub', text: 'Equal opportunity compares the true-positive rate between groups. Red bars belong to a model whose gap exceeds the policy limit.' }));
    }
    el.appendChild(h('p', { class: 'sub', style: 'margin-top:12px', text: 'The fairness threshold is this project\'s own demo rule, not a legal requirement. Data is synthetic.' }));
    return el;
  }

  function scatter(items, th) {
    var W = 560, H = 280, L = 56, R = 16, T = 12, B = 40;
    var maxGap = Math.max(th.maximum_fairness_gap * 2.4, Math.max.apply(null, items.map(function (m) { return m.metrics.fairness_gap; })) * 1.15);
    var accs = items.map(function (m) { return m.metrics.accuracy; });
    var minAcc = Math.min(th.minimum_accuracy - 0.05, Math.min.apply(null, accs) - 0.03);
    var maxAcc = Math.max(0.9, Math.max.apply(null, accs) + 0.03);
    function X(v) { return L + v / maxGap * (W - L - R); }
    function Y(v) { return T + (maxAcc - v) / (maxAcc - minAcc) * (H - T - B); }
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img', 'aria-label': 'Accuracy against fairness gap for each model, with the policy-safe region shaded' });
    svg.appendChild(s('rect', { x: X(0), y: Y(maxAcc), width: X(th.maximum_fairness_gap) - X(0), height: Y(th.minimum_accuracy) - Y(maxAcc), class: 'safe' }));
    svg.appendChild(s('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, class: 'axis' }));
    svg.appendChild(s('line', { x1: L, y1: T, x2: L, y2: H - B, class: 'axis' }));
    svg.appendChild(s('line', { x1: X(th.maximum_fairness_gap), y1: T, x2: X(th.maximum_fairness_gap), y2: H - B, class: 'limit' }));
    svg.appendChild(s('line', { x1: L, y1: Y(th.minimum_accuracy), x2: W - R, y2: Y(th.minimum_accuracy), class: 'limit' }));
    function label(x, y, text, anchor, extra) { var t = s('text', { x: x, y: y, class: 'txt ' + (extra || ''), 'text-anchor': anchor || 'start' }); t.textContent = text; svg.appendChild(t); }
    label(W / 2, H - 8, 'Fairness gap (lower is better)', 'middle', 'm');
    label(12, H / 2, 'Accuracy', 'middle', 'm');
    svg.lastChild.setAttribute('transform', 'rotate(-90 12 ' + (H / 2) + ')');
    label(X(th.maximum_fairness_gap) + 4, T + 12, 'max gap ' + th.maximum_fairness_gap, 'start', 'm');
    label(W - R, Y(th.minimum_accuracy) - 5, 'min accuracy ' + th.minimum_accuracy, 'end', 'm');
    [0, th.maximum_fairness_gap, maxGap].forEach(function (v) { label(X(v), H - B + 14, v.toFixed(2), 'middle', 'm'); });
    [0.7, 0.75, 0.8, 0.85, 0.9].forEach(function (v) {
      if (v > minAcc && v < maxAcc) { svg.appendChild(s('line', { x1: L, y1: Y(v), x2: W - R, y2: Y(v), class: 'grid' })); label(L - 6, Y(v) + 4, v.toFixed(2), 'end', 'm'); }
    });
    var groups = {};
    items.forEach(function (m) {
      var key = m.metrics.fairness_gap + '|' + m.metrics.accuracy;
      (groups[key] = groups[key] || { m: m, names: [] }).names.push(m.variants.join(', ') || '?');
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key], m = g.m;
      var bad = m.metrics.fairness_gap > th.maximum_fairness_gap || m.metrics.accuracy < th.minimum_accuracy;
      var c = s('circle', { cx: X(m.metrics.fairness_gap), cy: Y(m.metrics.accuracy), r: 7, class: 'pt' + (bad ? ' fail' : '') });
      c.appendChild(s('title', {})).textContent = 'Model ' + g.names.join(' and ') + ': accuracy ' + num(m.metrics.accuracy) + ', gap ' + num(m.metrics.fairness_gap) + (g.names.length > 1 ? ' (identical metrics)' : '');
      svg.appendChild(c);
      label(X(m.metrics.fairness_gap) + 11, Y(m.metrics.accuracy) + 4, g.names.join(', '), 'start');
    });
    return h('div', { class: 'tablewrap' }, [svg, h('p', { class: 'sub', text: 'The shaded region meets both policy limits. Each dot is one model.' })]);
  }

  function groupBars(items, th) {
    var grid = h('div', { class: 'bars' });
    items.forEach(function (m) {
      var tpr = m.metrics.per_group_true_positive_rate;
      if (!tpr) return;
      Object.keys(tpr).sort().forEach(function (g) {
        var fill = h('i', { class: m.metrics.fairness_gap > th.maximum_fairness_gap ? 'over' : '' }); fill.style.width = (tpr[g] * 100) + '%';
        grid.appendChild(h('span', { text: 'Model ' + (m.variants.join(', ') || '?') + ', group ' + g }));
        grid.appendChild(h('div', { class: 'track' }, [fill]));
        grid.appendChild(h('span', { text: num(tpr[g], 2) }));
      });
    });
    return grid;
  }

  // ---- Duo vs Witness ----------------------------------------------------
  function duo(data) {
    var d = data.duo;
    var el = sec('Duo vs Witness', 'Duo drafts an advisory assessment of each merge request. The Witness recomputes it from the changed paths and keeps the stricter result.');
    var summary = d.assessments + ' assessment' + (d.assessments === 1 ? '' : 's') + ' recorded. Agreed: ' + d.agreed + '. Overridden by the Witness: ' + d.overridden + '.';
    el.appendChild(h('p', {}, [h('b', { text: summary })]));
    el.appendChild(h('p', { class: 'sub', text: d.rate_shown
      ? 'Override rate: ' + Math.round(d.override_rate * 100) + '% of ' + d.assessments + ' assessments.'
      : 'An override rate is not shown until at least 3 assessments exist; with fewer, a percentage would be misleading.' }));
    if (!d.items.length) {
      var ran = [];
      ((data.work || {}).issues || []).forEach(function (i) { if (i.author && i.author.kind === 'duo') ran.push(h('li', {}, [h('a', { href: i.web_url, target: '_blank', rel: 'noopener', text: 'Investigator \u2192 issue #' + i.iid + ' \u2197' })])); });
      ((data.work || {}).merge_requests || []).forEach(function (m) { if (m.session) ran.push(h('li', {}, [h('a', { href: m.web_url, target: '_blank', rel: 'noopener', text: 'Repair \u2192 merge request !' + m.iid + ' \u2197' }), ' (session ' + m.session + ')'])); });
      el.appendChild(h('p', { class: 'notice', text: 'No Impact Analyst assessment has been recorded yet, so there is no Duo-versus-Witness comparison to show. The flows are wired; each starts when a person mentions its service account on an issue or merge request, and each run uses GitLab Credits. Nothing on this page is simulated.' }));
      if (ran.length) { el.appendChild(h('p', { class: 'sub', text: 'Duo flows that have run in this project (real records):' })); el.appendChild(h('ul', {}, ran)); }
    }
    if (d.items.length) {
      var head = h('tr', {}, ['Merge request', 'Duo scope', 'Duo risk', 'Witness scope', 'Witness risk', 'Result', 'Session'].map(function (t) { return h('th', { text: t }); }));
      var rows = d.items.map(function (i) {
        return h('tr', {}, [
          h('td', {}, [h('a', { href: data.project_url + '/-/merge_requests/' + i.mr_iid, text: '!' + i.mr_iid })]),
          h('td', { text: (i.duo_scope || []).join(', ') || NOT_RECORDED }),
          h('td', {}, [h('span', { class: 'chip gray', text: (i.duo_risk || NOT_RECORDED).toUpperCase() })]),
          h('td', { text: (i.witness_scope || []).join(', ') || NOT_RECORDED }),
          h('td', {}, [h('span', { class: 'chip ' + (i.witness_risk === 'high' ? 'blocked' : 'gray'), text: (i.witness_risk || NOT_RECORDED).toUpperCase() })]),
          h('td', {}, [h('span', { class: 'chip ' + (i.overridden ? 'amber' : 'ok'), text: i.overridden ? 'Witness overrode Duo' : 'Agreed' })]),
          h('td', { text: i.session || NOT_RECORDED })
        ]);
      });
      el.appendChild(h('div', { class: 'tablewrap' }, [h('table', {}, [h('thead', {}, [head]), h('tbody', {}, rows)])]));
    }
    return el;
  }

  function footer(data) {
    var f = h('footer', {});
    f.appendChild(h('p', { text: (data.snapshot ? 'Static snapshot taken ' + fmtTime(data.generated_at) + ' (not live), from GitLab pipelines and job artifacts.' : 'Data as of ' + fmtTime(data.generated_at) + ', collected from GitLab pipelines and job artifacts.') }));
    // The signing sentence is shown as fact only once a run really has a verified signature with a Rekor entry.
    var anySigned = (data.runs || []).some(function (r) { var e = r.signature && r.signature.evidence; return !!(e && e.signed && e.rekor && e.rekor.log_index != null); });
    f.appendChild(h('p', { text: anySigned
      ? 'Synthetic data and a demo policy. Evidence is signed with Sigstore keyless (GitLab CI identity) and logged in Rekor. The signature proves the evidence came from this pipeline and is unaltered; it does not assert a human reviewed correctness. Runs before signing was added show "Not signed". This dashboard explains decisions; it does not make them.'
      : 'Synthetic data and a demo policy. Evidence signing (Sigstore keyless, GitLab CI identity, logged in Rekor) is built into the pipeline, but no signed run has been recorded in this snapshot yet, so every run shows "Not signed". The evidence is hash-bound. A signature would prove origin and integrity, not that a human reviewed correctness. This dashboard explains decisions; it does not make them.' }));
    f.appendChild(h('p', {}, [h('a', { href: data.project_url + '/-/blob/main/docs/CONTROLS.md', target: '_blank', rel: 'noopener', text: 'Standards alignment \u2197' }), ' (aligned with, not certified against, NIST AI RMF, SR 11-7, ISO/IEC 42001 and SLSA).']));
    return f;
  }

  // Data baked into the page (data.js) needs no request, so it also works from disk or any static host.
  if (window.GASKET_DATA) {
    render(window.GASKET_DATA);
  } else {
    fetch('data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(render)
      .catch(function (err) {
        var app = document.getElementById('app');
        app.textContent = '';
        app.appendChild(h('div', { class: 'notice warn', text: 'Could not load data.json (' + err.message + '). The per-run evidence pages under runs/ are still available.' }));
      });
  }
})();
