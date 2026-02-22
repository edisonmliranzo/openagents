# ML Automation

This folder provides end-to-end ML automation:

- Data preprocessing automation
- Hyperparameter optimization (HPO)
- Model retraining pipeline
- API trigger endpoint
- Cron-style local scheduler
- Calendar-event-driven retraining
- CI/CD workflow integration

## 1) Install dependencies

```bash
python -m pip install --upgrade pip
pip install -r ml/requirements.txt
```

## 2) Configure

Edit `ml/config.yaml`:

- `dataset.input_csv`: CSV path (leave empty to use built-in sklearn sample dataset)
- `dataset.target_column`: label column when using CSV
- `model.type`: `random_forest` or `logistic_regression`
- `hpo.enabled`: enable/disable tuning
- `training.min_accuracy_to_promote`: promotion threshold
- `schedule.cron`: cron expression for automatic retraining
- `calendar.*`: calendar watcher settings

## 3) Run automation commands

```bash
python ml/automation.py --config ml/config.yaml preprocess
python ml/automation.py --config ml/config.yaml hpo
python ml/automation.py --config ml/config.yaml train
python ml/automation.py --config ml/config.yaml pipeline
```

Or through npm scripts:

```bash
pnpm ml:preprocess
pnpm ml:hpo
pnpm ml:train
pnpm ml:pipeline
```

## 4) API trigger (for cron jobs or external systems)

```bash
python ml/automation.py --config ml/config.yaml serve --host 0.0.0.0 --port 8010
```

Endpoints:

- `GET /health`
- `POST /train` (requires `Authorization: Bearer <token>` when `api.bearer_token` is set)

## 5) Local scheduling

```bash
python ml/automation.py --config ml/config.yaml schedule
```

## 6) Calendar event scheduling

Use either `calendar.ics_path` or `calendar.ics_url` in `ml/config.yaml`, then:

```bash
python ml/automation.py --config ml/config.yaml calendar-watch
```

Any event containing `calendar.event_keyword` and starting within `lookahead_minutes` triggers retraining once.

## Artifacts

Outputs are written under `ml/artifacts/`:

- `runs/<run_id>/model.joblib`
- `runs/<run_id>/metrics.json`
- `runs/<run_id>/hpo.json`
- `runs/<run_id>/summary.md`
- `production/model.joblib` (promoted model)
- `production/metrics.json`
