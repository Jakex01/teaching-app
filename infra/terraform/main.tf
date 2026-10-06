# One VM in Warsaw that runs the app with Docker Compose (deploy/docker-compose.prod.yml):
# Caddy (HTTPS) → web and sync, Postgres in a container. Backups go to Cloud Storage,
# the disk gets daily snapshots. SSH only through Identity-Aware Proxy, never open to the internet.

locals {
  name   = "doodle-board"
  labels = { app = "doodle-board", managed_by = "terraform" }
}

resource "google_project_service" "apis" {
  for_each = toset(concat(
    [
      "compute.googleapis.com", "dns.googleapis.com", "storage.googleapis.com", "iap.googleapis.com",
      "iam.googleapis.com", "cloudresourcemanager.googleapis.com",
    ],
    var.billing_account == "" ? [] : ["billingbudgets.googleapis.com"],
  ))
  service            = each.value
  disable_on_destroy = false
}

# ---------- Network: our own VPC, so the default network's permissive rules don't apply ----------
resource "google_compute_network" "main" {
  name                    = local.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "main" {
  name                     = "${local.name}-${var.region}"
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.10.0.0/24"
  region                   = var.region
  private_ip_google_access = true
}

resource "google_compute_address" "web" {
  name       = "${local.name}-ip"
  region     = var.region
  depends_on = [google_project_service.apis]
}

resource "google_compute_firewall" "web" {
  name          = "${local.name}-allow-web"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

# SSH only from Google's Identity-Aware Proxy range: `gcloud compute ssh --tunnel-through-iap`.
resource "google_compute_firewall" "ssh_iap" {
  name          = "${local.name}-allow-ssh-iap"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ssh-iap"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# ---------- Backups bucket ----------
# No access logging: it would need a second bucket just for logs. Only the VM's service account can
# write here (no public access), and admin operations are recorded by Cloud Audit Logs anyway.
# nosemgrep: terraform.gcp.security.gcp-cloud-storage-logging.gcp-cloud-storage-logging
resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-backups"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels

  # A backup overwritten or deleted by mistake can still be restored for a week.
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition { age = var.backup_retention_days }
    action { type = "Delete" }
  }
  lifecycle_rule {
    condition { days_since_noncurrent_time = 7 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.apis]
}

# ---------- The VM's identity: only what it needs ----------
resource "google_service_account" "vm" {
  account_id   = "${local.name}-vm"
  display_name = "Doodle Board VM"
  depends_on   = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "vm_backups" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_project_iam_member" "vm_logs" {
  for_each = toset(["roles/logging.logWriter", "roles/monitoring.metricWriter"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.vm.email}"
}

# ---------- The VM ----------
resource "google_compute_instance" "app" {
  name                      = local.name
  machine_type              = var.machine_type
  zone                      = var.zone
  tags                      = ["web", "ssh-iap"]
  labels                    = local.labels
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.main.id
    access_config {
      nat_ip = google_compute_address.web.address
    }
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"] # what it may actually do is set by the IAM roles above
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin         = "TRUE" # SSH keys come from Google accounts, not from metadata
    block-project-ssh-keys = "TRUE"
    startup-script = templatefile("${path.module}/startup.sh", {
      backup_bucket = google_storage_bucket.backups.name
    })
  }

  depends_on = [google_project_service.apis]
}

# Daily disk snapshots, kept for a week: a second safety net next to the database dumps.
resource "google_compute_resource_policy" "daily_snapshot" {
  name       = "${local.name}-daily-snapshot"
  region     = var.region
  depends_on = [google_project_service.apis]
  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"
      }
    }
    retention_policy {
      max_retention_days    = 7
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      storage_locations = [var.region]
      labels            = local.labels
    }
  }
}

resource "google_compute_disk_resource_policy_attachment" "app" {
  name = google_compute_resource_policy.daily_snapshot.name
  disk = google_compute_instance.app.name
  zone = var.zone
}

# ---------- DNS (once the domain is bought): app.<domain> and sync.<domain> ----------
data "google_dns_managed_zone" "main" {
  count = var.domain != "" && var.dns_zone != "" ? 1 : 0
  name  = var.dns_zone
}

resource "google_dns_record_set" "app" {
  for_each     = var.domain != "" && var.dns_zone != "" ? toset(["app", "sync"]) : toset([])
  managed_zone = data.google_dns_managed_zone.main[0].name
  name         = "${each.value}.${var.domain}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.web.address]
}

# ---------- Budget alert ----------
data "google_project" "current" {}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "${local.name} monthly"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }
  amount {
    specified_amount {
      currency_code = "PLN"
      units         = tostring(var.monthly_budget_pln)
    }
  }
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }
  depends_on = [google_project_service.apis]
}
