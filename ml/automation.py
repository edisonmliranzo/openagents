#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import shutil
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
import requests
import uvicorn
import yaml
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Header, HTTPException
from icalendar import Calendar
from sklearn.compose import ColumnTransformer
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DEFAULT_CONFIG: dict[str, Any] = {
    "dataset": {
        "input_csv": "",
        "target_column": "target",
        "drop_columns": [],
        "test_size": 0.2,
        "random_state": 42,
    },
    "preprocess": {
        "numeric_imputer": "median",
        "categorical_imputer": "most_frequent",
        "scale_numeric": True,
    },
    "model": {
        "type": "random_forest",
    },
    "hpo": {
        "enabled": True,
        "cv_folds": 3,
        "scoring": "f1_weighted",
        "param_grid": {},
    },
    "training": {
        "min_accuracy_to_promote": 0.85,
    },
    "artifacts": {
        "base_dir": "ml/artifacts",
    },
    "api": {
        "bearer_token": "",
    },
    "schedule": {
        "cron": "0 3 * * 1",
    },
    "calendar": {
        "ics_path": "",
        "ics_url": "",
        "event_keyword": "OpenAgents Retrain",
        "lookahead_minutes": 30,
        "poll_seconds": 60,
    },
}


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in override.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def load_config(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with config_path.open("r", encoding="utf-8") as f:
        loaded = yaml.safe_load(f) or {}
    return deep_merge(DEFAULT_CONFIG, loaded)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_run_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{uuid.uuid4().hex[:8]}"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_dataset(config: dict[str, Any]) -> tuple[pd.DataFrame, pd.Series]:
    dataset_cfg = config["dataset"]
    input_csv = str(dataset_cfg.get("input_csv", "")).strip()
    target_column = str(dataset_cfg.get("target_column", "target")).strip()
    drop_columns = [str(x) for x in dataset_cfg.get("drop_columns", [])]

    if input_csv:
        csv_path = Path(input_csv)
        if not csv_path.exists():
            raise FileNotFoundError(f"Dataset CSV not found: {csv_path}")
        df = pd.read_csv(csv_path)
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in {csv_path}")
        y = df[target_column]
        X = df.drop(columns=[target_column], errors="ignore")
        if drop_columns:
            X = X.drop(columns=drop_columns, errors="ignore")
        return X, y

    # Fallback sample dataset for quick local automation bootstrap.
    sk = load_breast_cancer(as_frame=True)
    X = sk.data.copy()
    y = sk.target.copy()
    return X, y


def split_dataset(
    X: pd.DataFrame,
    y: pd.Series,
    config: dict[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    dataset_cfg = config["dataset"]
    test_size = float(dataset_cfg.get("test_size", 0.2))
    random_state = int(dataset_cfg.get("random_state", 42))
    return train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y if y.nunique() > 1 else None,
    )


def build_preprocessor(X: pd.DataFrame, config: dict[str, Any]) -> ColumnTransformer | str:
    preprocess_cfg = config["preprocess"]
    num_imputer = str(preprocess_cfg.get("numeric_imputer", "median"))
    cat_imputer = str(preprocess_cfg.get("categorical_imputer", "most_frequent"))
    scale_numeric = bool(preprocess_cfg.get("scale_numeric", True))

    numeric_cols = X.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]

    transformers: list[tuple[str, Pipeline, list[str]]] = []
    if numeric_cols:
        numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy=num_imputer))]
        if scale_numeric:
            numeric_steps.append(("scaler", StandardScaler()))
        transformers.append(("numeric", Pipeline(steps=numeric_steps), numeric_cols))

    if categorical_cols:
        cat_steps = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy=cat_imputer)),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]
        )
        transformers.append(("categorical", cat_steps, categorical_cols))

    if not transformers:
        return "passthrough"
    return ColumnTransformer(transformers=transformers, remainder="drop")


def build_model(config: dict[str, Any]) -> Any:
    model_type = str(config["model"].get("type", "random_forest")).strip().lower()
    seed = int(config["dataset"].get("random_state", 42))
    if model_type == "random_forest":
        return RandomForestClassifier(n_estimators=200, random_state=seed)
    if model_type == "logistic_regression":
        return LogisticRegression(max_iter=2000, random_state=seed)
    raise ValueError(f"Unsupported model type: {model_type}")


def default_param_grid(model_type: str) -> dict[str, list[Any]]:
    if model_type == "random_forest":
        return {
            "model__n_estimators": [100, 200, 300],
            "model__max_depth": [None, 10, 20],
            "model__min_samples_split": [2, 5],
        }
    if model_type == "logistic_regression":
        return {
            "model__C": [0.1, 1.0, 10.0],
            "model__solver": ["lbfgs", "liblinear"],
        }
    return {}


def normalize_param_grid(raw_grid: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in raw_grid.items():
        if "__" in key:
            normalized[key] = value
        else:
            normalized[f"model__{key}"] = value
    return normalized


def train_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    config: dict[str, Any],
) -> tuple[Pipeline, dict[str, Any]]:
    model_type = str(config["model"].get("type", "random_forest")).strip().lower()
    preprocessor = build_preprocessor(X_train, config)
    estimator = Pipeline(steps=[("preprocessor", preprocessor), ("model", build_model(config))])

    hpo_cfg = config["hpo"]
    if not bool(hpo_cfg.get("enabled", True)):
        estimator.fit(X_train, y_train)
        return estimator, {"enabled": False}

    configured_grid = hpo_cfg.get("param_grid") or {}
    grid = normalize_param_grid(configured_grid) if configured_grid else default_param_grid(model_type)
    cv_folds = int(hpo_cfg.get("cv_folds", 3))
    scoring = str(hpo_cfg.get("scoring", "f1_weighted"))

    if not grid:
        estimator.fit(X_train, y_train)
        return estimator, {"enabled": True, "used_default_grid": False, "best_params": {}}

    search = GridSearchCV(
        estimator=estimator,
        param_grid=grid,
        cv=cv_folds,
        n_jobs=-1,
        scoring=scoring,
        error_score="raise",
    )
    search.fit(X_train, y_train)
    best_estimator = search.best_estimator_
    return best_estimator, {
        "enabled": True,
        "used_default_grid": not bool(configured_grid),
        "cv_folds": cv_folds,
        "scoring": scoring,
        "best_score": float(search.best_score_),
        "best_params": search.best_params_,
    }


def evaluate_model(model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> dict[str, Any]:
    y_pred = model.predict(X_test)
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, y_pred, average="weighted", zero_division=0)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision_weighted": float(precision),
        "recall_weighted": float(recall),
        "f1_weighted": float(f1),
        "rows_tested": int(len(y_test)),
    }


def save_preprocess_snapshot(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    run_dir: Path,
) -> dict[str, Any]:
    preprocessed_dir = run_dir / "preprocessed"
    ensure_dir(preprocessed_dir)

    train_df = X_train.copy()
    train_df["target"] = y_train.values
    test_df = X_test.copy()
    test_df["target"] = y_test.values

    train_csv = preprocessed_dir / "train.csv"
    test_csv = preprocessed_dir / "test.csv"
    train_df.to_csv(train_csv, index=False)
    test_df.to_csv(test_csv, index=False)

    return {
        "train_csv": str(train_csv),
        "test_csv": str(test_csv),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
    }


def maybe_promote(model_path: Path, metrics: dict[str, Any], config: dict[str, Any], run_id: str) -> dict[str, Any]:
    base_dir = Path(config["artifacts"]["base_dir"])
    production_dir = base_dir / "production"
    ensure_dir(production_dir)

    threshold = float(config["training"].get("min_accuracy_to_promote", 0.85))
    prod_metrics_path = production_dir / "metrics.json"
    previous_metrics = read_json(prod_metrics_path)
    previous_accuracy = float(previous_metrics.get("accuracy", -1.0))
    current_accuracy = float(metrics.get("accuracy", 0.0))

    promote = current_accuracy >= threshold and current_accuracy >= previous_accuracy
    promotion = {
        "promoted": promote,
        "threshold": threshold,
        "previous_accuracy": previous_accuracy,
        "current_accuracy": current_accuracy,
    }
    if not promote:
        return promotion

    shutil.copy2(model_path, production_dir / "model.joblib")
    out_metrics = dict(metrics)
    out_metrics["run_id"] = run_id
    out_metrics["promoted_at"] = utc_now_iso()
    write_json(prod_metrics_path, out_metrics)
    return promotion


def run_pipeline(config: dict[str, Any], reason: str = "manual") -> dict[str, Any]:
    base_dir = Path(config["artifacts"]["base_dir"])
    run_id = make_run_id()
    run_dir = base_dir / "runs" / run_id
    ensure_dir(run_dir)

    X, y = load_dataset(config)
    X_train, X_test, y_train, y_test = split_dataset(X, y, config)

    preprocess_report = save_preprocess_snapshot(X_train, X_test, y_train, y_test, run_dir)
    model, hpo_report = train_model(X_train, y_train, config)
    metrics = evaluate_model(model, X_test, y_test)

    model_path = run_dir / "model.joblib"
    joblib.dump(model, model_path)
    write_json(run_dir / "metrics.json", metrics)
    write_json(run_dir / "hpo.json", hpo_report)

    promotion = maybe_promote(model_path, metrics, config, run_id)
    run_summary = {
        "run_id": run_id,
        "reason": reason,
        "created_at": utc_now_iso(),
        "metrics": metrics,
        "hpo": hpo_report,
        "preprocess": preprocess_report,
        "promotion": promotion,
        "artifacts": {
            "run_dir": str(run_dir),
            "model_path": str(model_path),
        },
    }
    write_json(run_dir / "summary.json", run_summary)
    write_summary_markdown(run_dir / "summary.md", run_summary)
    write_json(base_dir / "latest_run.json", run_summary)

    return run_summary


def write_summary_markdown(path: Path, summary: dict[str, Any]) -> None:
    lines = [
        f"# ML Run {summary['run_id']}",
        "",
        f"- Created: {summary['created_at']}",
        f"- Reason: {summary['reason']}",
        f"- Accuracy: {summary['metrics']['accuracy']:.4f}",
        f"- F1 (weighted): {summary['metrics']['f1_weighted']:.4f}",
        f"- Promoted: {summary['promotion']['promoted']}",
        "",
        "## Artifacts",
        f"- Run dir: `{summary['artifacts']['run_dir']}`",
        f"- Model: `{summary['artifacts']['model_path']}`",
    ]
    ensure_dir(path.parent)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_preprocess_only(config: dict[str, Any]) -> dict[str, Any]:
    base_dir = Path(config["artifacts"]["base_dir"])
    run_dir = base_dir / "preprocess" / make_run_id()
    ensure_dir(run_dir)
    X, y = load_dataset(config)
    X_train, X_test, y_train, y_test = split_dataset(X, y, config)
    preprocess_report = save_preprocess_snapshot(X_train, X_test, y_train, y_test, run_dir)
    payload = {
        "created_at": utc_now_iso(),
        "run_dir": str(run_dir),
        "preprocess": preprocess_report,
    }
    write_json(run_dir / "summary.json", payload)
    return payload


def run_hpo_only(config: dict[str, Any]) -> dict[str, Any]:
    base_dir = Path(config["artifacts"]["base_dir"])
    run_dir = base_dir / "hpo" / make_run_id()
    ensure_dir(run_dir)

    X, y = load_dataset(config)
    X_train, X_test, y_train, y_test = split_dataset(X, y, config)
    model, hpo_report = train_model(X_train, y_train, config)
    metrics = evaluate_model(model, X_test, y_test)

    payload = {
        "created_at": utc_now_iso(),
        "run_dir": str(run_dir),
        "hpo": hpo_report,
        "metrics": metrics,
    }
    write_json(run_dir / "summary.json", payload)
    return payload


def run_schedule(config_path: Path) -> None:
    config = load_config(config_path)
    cron_expr = str(config["schedule"].get("cron", "0 3 * * 1")).strip()
    trigger = CronTrigger.from_crontab(cron_expr)

    def job() -> None:
        cfg = load_config(config_path)
        summary = run_pipeline(cfg, reason="scheduled")
        print(json.dumps({"event": "scheduled_run_complete", "run_id": summary["run_id"]}))

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(job, trigger=trigger, id="ml-retrain", replace_existing=True)
    print(f"Scheduler started with cron='{cron_expr}' (UTC).")
    scheduler.start()


def load_ics_source(config: dict[str, Any]) -> str:
    cal_cfg = config["calendar"]
    ics_path = str(cal_cfg.get("ics_path", "")).strip()
    ics_url = str(cal_cfg.get("ics_url", "")).strip()

    if ics_path:
        path = Path(ics_path)
        if not path.exists():
            raise FileNotFoundError(f"calendar.ics_path not found: {path}")
        return path.read_text(encoding="utf-8")

    if ics_url:
        response = requests.get(ics_url, timeout=20)
        response.raise_for_status()
        return response.text

    raise ValueError("Set calendar.ics_path or calendar.ics_url in config.")


def parse_calendar_events(ics_text: str) -> list[dict[str, Any]]:
    calendar = Calendar.from_ical(ics_text)
    events: list[dict[str, Any]] = []

    for component in calendar.walk():
        if getattr(component, "name", "") != "VEVENT":
            continue

        raw_summary = component.get("summary")
        name = str(raw_summary) if raw_summary is not None else ""
        uid = str(component.get("uid") or "")

        dtstart = component.get("dtstart")
        if dtstart is None:
            continue

        start_value = dtstart.dt
        if isinstance(start_value, datetime):
            start_dt = start_value
        elif isinstance(start_value, date):
            start_dt = datetime.combine(start_value, datetime.min.time())
        else:
            continue

        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        else:
            start_dt = start_dt.astimezone(timezone.utc)

        if not uid:
            uid = f"{name}:{start_dt.isoformat()}"

        events.append({"uid": uid, "name": name, "start_dt": start_dt})

    return events


def run_calendar_watch(config_path: Path) -> None:
    config = load_config(config_path)
    base_dir = Path(config["artifacts"]["base_dir"])
    state_path = base_dir / ".calendar_state.json"
    ensure_dir(base_dir)
    state = read_json(state_path)
    seen_ids = set(state.get("seen_event_ids", []))

    cal_cfg = config["calendar"]
    keyword = str(cal_cfg.get("event_keyword", "OpenAgents Retrain")).strip().lower()
    lookahead_minutes = int(cal_cfg.get("lookahead_minutes", 30))
    poll_seconds = int(cal_cfg.get("poll_seconds", 60))

    print(
        f"Calendar watcher started. keyword='{keyword}', "
        f"lookahead={lookahead_minutes}m, poll={poll_seconds}s"
    )
    while True:
        try:
            cfg = load_config(config_path)
            calendar_text = load_ics_source(cfg)
            events = parse_calendar_events(calendar_text)
            now = datetime.now(timezone.utc)
            cutoff = now + timedelta(minutes=lookahead_minutes)

            for event in events:
                name = str(event["name"]).strip()
                if keyword and keyword not in name.lower():
                    continue

                start_dt = event["start_dt"]

                if not (now <= start_dt <= cutoff):
                    continue

                uid = str(event["uid"])
                if uid in seen_ids:
                    continue

                summary = run_pipeline(cfg, reason=f"calendar:{name}")
                seen_ids.add(uid)
                write_json(
                    state_path,
                    {
                        "seen_event_ids": sorted(seen_ids),
                        "updated_at": utc_now_iso(),
                        "last_run_id": summary["run_id"],
                    },
                )
                print(
                    json.dumps(
                        {
                            "event": "calendar_triggered",
                            "calendar_event": name,
                            "run_id": summary["run_id"],
                        }
                    )
                )
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"event": "calendar_watch_error", "error": str(exc)}))

        time.sleep(poll_seconds)


def create_api_app(config_path: Path) -> FastAPI:
    app = FastAPI(title="OpenAgents ML Automation API", version="1.0.0")

    def authorize(authorization: str | None, token_required: str) -> None:
        if not token_required:
            return
        if not authorization:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization must use Bearer token")
        token = authorization.split(" ", 1)[1].strip()
        if token != token_required:
            raise HTTPException(status_code=403, detail="Invalid bearer token")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "time": utc_now_iso()}

    @app.post("/train")
    def trigger_train(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        cfg = load_config(config_path)
        token_required = str(cfg.get("api", {}).get("bearer_token", "")).strip()
        authorize(authorization, token_required)
        summary = run_pipeline(cfg, reason="api")
        return {"ok": True, "run_id": summary["run_id"], "metrics": summary["metrics"]}

    return app


def run_api_server(config_path: Path, host: str, port: int) -> None:
    app = create_api_app(config_path)
    uvicorn.run(app, host=host, port=port, log_level="info")


def print_json(data: dict[str, Any]) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ML automation CLI")
    parser.add_argument(
        "--config",
        default="ml/config.yaml",
        help="Path to YAML config file",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("preprocess", help="Run data preprocessing snapshot only")
    subparsers.add_parser("hpo", help="Run HPO and evaluation only")
    subparsers.add_parser("train", help="Run training (with/without HPO per config)")
    subparsers.add_parser("pipeline", help="Run full retraining pipeline")
    subparsers.add_parser("schedule", help="Run local cron scheduler for retraining")
    subparsers.add_parser("calendar-watch", help="Trigger retraining from calendar events")

    serve = subparsers.add_parser("serve", help="Run API server for retraining triggers")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8010)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config_path = Path(args.config)
    config = load_config(config_path)

    if args.command == "preprocess":
        print_json(run_preprocess_only(config))
        return
    if args.command == "hpo":
        print_json(run_hpo_only(config))
        return
    if args.command == "train":
        print_json(run_pipeline(config, reason="train"))
        return
    if args.command == "pipeline":
        print_json(run_pipeline(config, reason="pipeline"))
        return
    if args.command == "schedule":
        run_schedule(config_path)
        return
    if args.command == "calendar-watch":
        run_calendar_watch(config_path)
        return
    if args.command == "serve":
        run_api_server(config_path, args.host, args.port)
        return

    raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
