terraform {
  required_version = ">= 1.16"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.5"
    }
  }

  # State lives in a Cloud Storage bucket (made once by hand, see infra/README.md):
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "doodle-board"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
  # Some APIs (budgets) need to know which project pays for the API call itself.
  user_project_override = true
  billing_project       = var.project_id
}
