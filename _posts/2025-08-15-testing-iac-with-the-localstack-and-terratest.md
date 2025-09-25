---
layout: post
title: "Testing IaC with the Localstack and Terratest"
tags: terraform quality testing iac
---

## Context

You write a Terraform module, parameterize the inputs, add some advanced settings, and push your PR. You're 76% confident it works as intended. Most configuration looks solid, but a few settings could go either way when your `apply` pipeline runs. You've heard about test-driven development, seen `test` directories in popular open source Terraform modules with some obscure Go code, but you're not sure how it all fits together. On top of that, you don't have a dedicated test account for deploying test resources, and spinning up real AWS infrastructure just to test some simple configurations feels like overkill.

I've seen this scenario _a lot_, so I took a crack at a solution. Testing Infrastructure as Code has always been a bit of a pain point with limited options. Lots of cross your fingers and hope, manual testing in dev accounts, unit testing with mocks that miss actual cloud provider interactions, or expensive integration testing with real resources (that become orphaned and require `aws-nuke`... different story for another blog). What we really need is something that gives us confidence without the overhead, cost, or complexity of managing separate test infrastructure.

## Building the TerraStack

I built yet another Go package to eliminate some pains of testing Infrastructure as Code (IaC). When you don't have a dedicated test account, can't predict how your configurations will hold up when they actually hit the API, and want to have a consolidated way to test locally and in CI/CD pipelines, this helper library can help. The [go-localstack](https://github.com/The-Infra-Company/go-localstack) package combines the power of LocalStack (a fully functional local AWS cloud stack) with Terratest's battle-tested testing framework. I jokingly call this duo the TerraStack (please don't sue me, company that _builds geospatial products that enable smarter land asset management and development_).

Any way, LocalStack spins up a containerized environment that mimics AWS services locally. No real resources, no surprise bills, no cleanup headaches. Your Terraform code thinks it's talking to real AWS, but it's actually hitting LocalStack's mock services running in Docker. This approach solves several pain points at once like fast feedback loops with tests running in seconds rather than minutes, CI/CD friendly integration since everything runs in containers, real API interactions unlike unit tests with mocks, and automatic cleanup when the container dies.

## Setting Up Your Test Environment

Let's walk through a basic example that tests a DynamoDB configuration. You'll need a basic Terraform configuration and a Go test file to get started. Here's a simple configuration that creates an DynamoDB table:

**test.tf:**

```hcl
# An example Terraform configuration for provisioning a DynamoDB table
resource "aws_dynamodb_table" "users" {
  name         = "users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "email"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  # Global Secondary Index for querying by email
  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying by creation date
  global_secondary_index {
    name            = "created-at-index"
    hash_key        = "created_at"
    projection_type = "ALL"
  }
}
```

For the provider configuration, you have two options. The first approach requires configuring the AWS provider to point directly to LocalStack endpoints. Notice how we're pointing the AWS provider endpoints to LocalStack instead of real AWS, using dummy credentials since LocalStack doesn't authenticate, and setting default tags to help identify resources created during testing:

**providers.tf:**

```hcl
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  s3_use_path_style           = false
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    dynamodb = "http://localhost:4566"
  }

  default_tags {
    tags = {
      Environment = "Local"
      Service     = "LocalStack"
    }
  }
}
```

Alternatively, you can skip the provider configuration entirely by using the `tflocal` binary instead of `terraform`. This is LocalStack's wrapper around Terraform that automatically configures all the necessary provider settings. To use this approach, you'll need to install the LocalStack CLI in your test environment with `pip install localstack`, then set the `TerraformBinary` option in your Terratest configuration to `tflocal`. This simplifies your setup significantly since you don't need to manage provider endpoint configurations, but it does add a Python dependency to your test environment.

## Writing Comprehensive Tests

The Go test is where `go-localstack` shines by abstracting away the container management complexity. Here's a basic test that demonstrates the core functionality:

**dynamodb_bucket_test.go:**

```go
package test

import (
	"context"
	"testing"

	"github.com/The-Infra-Company/go-localstack"
	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

func TestDynamoDBWithLocalStack(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	// Start LocalStack container
	runner, err := localstack.NewRunner(nil)
	assert.NoError(t, err)

	containerID, err := runner.Start(ctx)
	assert.NoError(t, err)
	assert.NotEmpty(t, containerID)

	// Run Terratest with Terraform options
	tfOptions := &terraform.Options{
		TerraformDir: ".",
		Upgrade:      true,
	}

	defer terraform.Destroy(t, tfOptions)
	terraform.InitAndApply(t, tfOptions)
}
```

This basic test spins up a LocalStack container using Docker, configures Terratest to run Terraform commands against our configuration, runs `terraform init` and `terraform apply`, and automatically runs `terraform destroy` when the test completes thanks to the defer statement. The entire test cycle from container startup to resource creation and cleanup takes just under 11 seconds, which is pretty impressive for a full integration test.

## Advanced Testing Scenarios

You can extend this approach significantly beyond basic resource creation. For more comprehensive validation, you can use Terratest's built-in assertion functions and the AWS SDK to verify that resources were created with the correct properties. Here's how you might validate that your S3 bucket name was created and outputted successfully:

You can add an additional output to your Terraform configuration:

```hcl
output "bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.example.bucket
}
```

And update your test logic to ensure the output logic works:

```go
// After terraform apply, validate the bucket was created correctly
bucketName := terraform.Output(t, tfOptions, "bucket_name")
assert.Equal(t, "my-tf-test-bucket", bucketName)
```

## Using Test Fixtures and Variables

For testing modules with different configurations, you can leverage Terratest's support for variable files and fixtures. Create a `fixtures` directory with different `.tfvars` files for various test scenarios:

```go
tfOptions := &terraform.Options{
    TerraformDir: "./fixtures/basic-bucket",
    VarFiles:     []string{"test.tfvars"},
    Vars: map[string]interface{}{
        "bucket_name": fmt.Sprintf("test-bucket-%s", uuid.New().String()),
        "environment": "test",
    },
}
```

This approach allows you to test the same module with different input combinations, ensuring your module handles edge cases correctly. You can create separate test functions for different scenarios - basic functionality, advanced configurations, error conditions, and variable validation. For example, you might have `TestBasicS3Bucket`, `TestS3BucketWithEncryption`, `TestS3BucketWithInvalidName` to cover various use cases.

## Testing Multi-Resource Stacks

The real power of this approach becomes evident when testing entire stacks of interconnected resources. You can test complete environments with VPCs, subnets, security groups, and EC2 instances all running against LocalStack. The container automatically handles service discovery and networking between different AWS services, so your Lambda functions can actually invoke other services, your EC2 instances can write to S3 buckets, and your API Gateway can trigger the right backend services.

Error condition testing is equally valuable - intentionally break configurations to ensure your modules fail gracefully and provide helpful error messages. This helps catch issues before they hit production and ensures your error handling is robust.

## Running Your Tests

With everything in place, you can run your tests with: `go test -v ./...`. The output shows what's happening during the test execution, including container startup, Terraform planning and applying, resource creation, and cleanup. The combination of LocalStack's AWS emulation and Terratest's testing framework gives you confidence that your infrastructure code works without the operational overhead of managing test accounts or worrying about resource cleanup.

**Test output:**

```console
❯ go test -v ./...
=== RUN   TestS3BucketWithLocalStack
{"status":"Pulling from localstack/localstack","id":"latest"}
TestS3BucketWithLocalStack 2025-08-15T12:19:29-04:00 retry.go:91: terraform [init -upgrade=true]
TestS3BucketWithLocalStack 2025-08-15T12:19:29-04:00 logger.go:67: Running command terraform with args [init -upgrade=true]
TestS3BucketWithLocalStack 2025-08-15T12:19:29-04:00 logger.go:67: Initializing the backend...
TestS3BucketWithLocalStack 2025-08-15T12:19:30-04:00 logger.go:67: Initializing provider plugins...
TestS3BucketWithLocalStack 2025-08-15T12:19:30-04:00 logger.go:67: - Finding latest version of hashicorp/aws...
TestS3BucketWithLocalStack 2025-08-15T12:19:30-04:00 logger.go:67: - Using previously-installed hashicorp/aws v6.9.0
TestS3BucketWithLocalStack 2025-08-15T12:19:30-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67: Terraform will perform the following actions:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:   # aws_s3_bucket.example will be created
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:   + resource "aws_s3_bucket" "example" {
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + acceleration_status         = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + acl                         = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + arn                         = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + bucket                      = "my-tf-test-bucket"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + bucket_domain_name          = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + bucket_prefix               = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + bucket_region               = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + bucket_regional_domain_name = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + force_destroy               = false
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + hosted_zone_id              = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + id                          = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + object_lock_enabled         = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + policy                      = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + region                      = "us-east-1"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + request_payer               = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + tags                        = {
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:           + "Environment" = "Dev"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:           + "Name"        = "My bucket"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:         }
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + tags_all                    = {
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:           + "Environment" = "Dev"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:           + "Name"        = "My bucket"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:           + "Service"     = "LocalStack"
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:         }
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + website_domain              = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + website_endpoint            = (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + cors_rule (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + grant (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + lifecycle_rule (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + logging (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + object_lock_configuration (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + replication_configuration (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + server_side_encryption_configuration (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + versioning (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:       + website (known after apply)
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:     }
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:33-04:00 logger.go:67: Plan: 1 to add, 0 to change, 0 to destroy.
TestS3BucketWithLocalStack 2025-08-15T12:19:34-04:00 logger.go:67: aws_s3_bucket.example: Creating...
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 logger.go:67: aws_s3_bucket.example: Creation complete after 0s [id=my-tf-test-bucket]
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 logger.go:67: Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 logger.go:67:
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 retry.go:91: terraform [destroy -auto-approve -input=false -lock=false]
TestS3BucketWithLocalStack 2025-08-15T12:19:35-04:00 logger.go:67: Running command terraform with args [destroy -auto-approve -input=false -lock=false]
TestS3BucketWithLocalStack 2025-08-15T12:19:38-04:00 logger.go:67: Plan: 0 to add, 0 to change, 1 to destroy.
TestS3BucketWithLocalStack 2025-08-15T12:19:39-04:00 logger.go:67: aws_s3_bucket.example: Destroying... [id=my-tf-test-bucket]
TestS3BucketWithLocalStack 2025-08-15T12:19:39-04:00 logger.go:67: aws_s3_bucket.example: Destruction complete after 0s

--- PASS: TestS3BucketWithLocalStack (10.83s)
```

I hope this gives you a solid foundation for testing your Terraform modules with the TerraStack. By leveraging LocalStack and Terratest, you can create fast, reliable tests that run locally or in CI/CD pipelines without the overhead of managing real AWS resources. This approach not only speeds up your development cycle but also gives you confidence that your IaC works as intended before it hits production. Happy testing! If you're interested in more of my work, check out my [GitHub](https://github.com/RoseSecurity).
