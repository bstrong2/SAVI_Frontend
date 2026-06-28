<script setup>
// Recipe view — layout stub only, no logic implemented yet.
</script>

<template>
  <div class="recipe-view">

    <!-- ── Toolbar ── -->
    <div class="view-toolbar">
      <button class="toolbar-btn" disabled>💾 Save Recipe</button>
      <button class="toolbar-btn" disabled>↩ Discard Changes</button>
      <button class="toolbar-btn" disabled>＋ Add Recipe</button>
    </div>

    <div class="recipe-body">

      <!-- ── Left panel: sensor lists ── -->
      <div class="recipe-left-panel">

        <!-- Recipes -->
        <div class="panel-section">
          <div class="panel-section-title">Recipes</div>
          <div class="recipe-tree">
            <div class="tree-node tree-child">
              <input type="radio" disabled name="recipe" /> Recipe 1
            </div>
            <div class="tree-node tree-child">
              <input type="radio" disabled name="recipe" /> Recipe 2
            </div>
          </div>
        </div>

        <!-- Digital Outputs -->
        <div class="panel-section">
          <div class="panel-section-title">DO — Digital Outputs</div>
          <div class="recipe-tree">
            <div class="tree-node tree-child">
              <input type="checkbox" disabled /> Relay 1
            </div>
            <div class="tree-node tree-child">
              <input type="checkbox" disabled /> Relay 2
            </div>
          </div>
        </div>

        <!-- Digital Inputs -->
        <div class="panel-section">
          <div class="panel-section-title">DI — Digital Inputs</div>
          <div class="recipe-tree">
            <div class="tree-node tree-child">
              <input type="checkbox" disabled /> Collision Detector 1
            </div>
            <div class="tree-node tree-child">
              <input type="checkbox" disabled /> Collision Detector 2
            </div>
          </div>
        </div>

      </div>

      <!-- ── Right panel: segment grid ── -->
      <div class="recipe-right-panel">
        <div class="recipe-grid-wrapper">
          <table class="recipe-grid">
            <thead>
              <tr>
                <th class="row-header"></th>
                <th>Step 1</th>
                <th>Step 2</th>
                <th>Step 3</th>
                <th class="add-step-col">＋</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="row-header">Action</td>
                <td><select disabled><option>Set Output</option></select></td>
                <td><select disabled><option>Wait for Input</option></select></td>
                <td><select disabled><option>Delay</option></select></td>
                <td></td>
              </tr>
              <tr class="row-group-header">
                <td class="row-header row-group-label" colspan="5">Digital Outputs (DO)</td>
              </tr>
              <tr>
                <td class="row-header row-indent">Relay 1</td>
                <td><select disabled><option>On</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td></td>
              </tr>
              <tr>
                <td class="row-header row-indent">Relay 2</td>
                <td><select disabled><option>Off</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td></td>
              </tr>
              <tr class="row-group-header">
                <td class="row-header row-group-label" colspan="5">Digital Inputs (DI)</td>
              </tr>
              <tr>
                <td class="row-header row-indent">Collision Detector 1</td>
                <td><select disabled><option>—</option></select></td>
                <td><select disabled><option>Triggered</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td></td>
              </tr>
              <tr>
                <td class="row-header row-indent">Collision Detector 2</td>
                <td><select disabled><option>—</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td><select disabled><option>—</option></select></td>
                <td></td>
              </tr>
              <tr class="row-group-header">
                <td class="row-header row-group-label" colspan="5">Timing</td>
              </tr>
              <tr>
                <td class="row-header row-indent">Duration (ms)</td>
                <td><input type="number" disabled placeholder="—" /></td>
                <td><input type="number" disabled placeholder="—" /></td>
                <td><input type="number" disabled placeholder="500" /></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
  .recipe-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Body ── */
  .recipe-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Left panel ── */
  .recipe-left-panel {
    width: 220px;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
    flex-shrink: 0;
  }

  .panel-section {
    border-bottom: 1px solid var(--border-color);
  }

  .panel-section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    padding: 6px 10px 4px;
    background: var(--bg-table-alt);
  }

  .recipe-tree { 
    padding: 4px 0; 
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text-primary);
  }

  .tree-child { 
    padding-left: 14px; 
  }

  /* ── Right panel ── */
  .recipe-right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .recipe-grid-wrapper {
    flex: 1;
    overflow: auto;
  }

  /* ── Segment grid ── */
  .recipe-grid {
    border-collapse: collapse;
    font-size: 12px;
    min-width: 100%;
  }

  .recipe-grid th,
  .recipe-grid td {
    border: 1px solid var(--border-color);
    padding: 4px 8px;
    white-space: nowrap;
  }

  .recipe-grid thead th {
    background: var(--bg-table-alt);
    font-weight: 600;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .row-header {
    background: var(--bg-table-alt);
    font-weight: 600;
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 160px;
  }

  .row-group-header td {
    background: var(--bg-panel);
    padding: 2px 8px;
  }

  .row-group-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
  }

  .row-indent { font-weight: 400; padding-left: 20px; }

  .recipe-grid input,
  .recipe-grid select {
    width: 110px;
    font-size: 12px;
    font-family: inherit;
    background: transparent;
    border: none;
    color: var(--text-primary);
    text-align: center;
  }

  .add-step-col {
    color: var(--text-secondary);
    min-width: 30px;
    text-align: center;
  }
</style>
