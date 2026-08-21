---
layout: post
title: "AWS Backups for Everyone"
tags: infra aws backups resilience devops
---

A few days ago, I was poking around AWS Organizations and came across backup policies. I've written plenty of backup plans and schedules over the years, but I didn't realize I could roll them out across an entire organization with a centrally managed policy. Wouldn't it be handy if workload teams could simply tag resources for daily, weekly, or monthly backups while platform teams managed the policy centrally? After digging through the documentation, I found plenty of clickops and CloudFormation examples but not much in the way of Terraform implementations. So today, I'm going to walk through a simple approach for managing organization-wide backups as code.

## What does AWS Backup do?

AWS Backup is a fully managed service that makes it easy to centralize and automate backups across [supported AWS services](https://docs.aws.amazon.com/aws-backup/latest/devguide/working-with-supported-services.html). Instead of configuring backups service by service, you can manage backup schedules, retention policies, and recovery operations from a single place.

Taking it a step further, AWS Organizations Backup Policies allow you to apply backup plans across accounts in your organization. Once deployed, the effective backup plan appears in each member account as an immutable plan managed by AWS Organizations. This gives platform teams a way to enforce backup standards without requiring every team to build and manage their own backup plans.

## How this looks in code

The following example creates an AWS Organizations backup policy and attaches it to your organization root or target OU.

### main.tf

```hcl
resource "aws_organizations_policy" "backup" {
  for_each = {
    for policy in var.backup_policies :
    policy.name => policy
    if var.enabled
  }

  name        = each.value.name
  description = try(each.value.description, null)
  type        = "BACKUP_POLICY"

  content = jsonencode(each.value.content)
}

# Attach the backup policy to the organization root or target OU.
resource "aws_organizations_policy_attachment" "backup" {
  for_each = {
    for policy in var.backup_policies :
    policy.name => policy
    if var.enabled
  }

  policy_id = aws_organizations_policy.backup[each.key].id
  target_id = each.value.target_id
}
```

### variables.tf

```hcl
# By default, we create organization-wide backup tiers that workload teams
# can opt into using resource tags. A single AWS Organizations Backup Policy
# is created and attached at the organization root.
#
# Resources tagged with one of the following values are automatically enrolled
# into the corresponding backup schedule:
#
#   Org.Backup = Daily
#   Org.Backup = Weekly
#   Org.Backup = Monthly
#
# Backup schedules and retention periods are centrally managed by the platform
# team. Workload teams are only responsible for tagging supported resources.
#
# Example:
#
# tags = {
#   Org.Backup = "Daily"
# }
variable "backup_policies" {
  description = "AWS Organizations backup policies."
  type = list(object({
    name        = string
    description = optional(string)
    target_id   = optional(string)
    content     = any
  }))
  default = [
    {
      name        = "organization-default-backups"
      description = "Organization-wide backup tiers selected using the Org.Backup tag."
      content = {
        plans = {
          Daily_Backup_Plan = {
            regions = {
              "@@assign" = [
                "us-east-1",
                "us-east-2"
              ]
            }
            rules = {
              Daily_Backup_Rule = {
                target_backup_vault_name = {
                  "@@assign" = "Default"
                }
                schedule_expression = {
                  "@@assign" = "cron(0 5 ? * * *)"
                }
                lifecycle = {
                  delete_after_days = {
                    "@@assign" = "35"
                  }
                }
              }
            }
            selections = {
              tags = {
                Daily = {
                  iam_role_arn = {
                    "@@assign" = "arn:aws:iam::$account:role/service-role/AWSBackupDefaultServiceRole"
                  }
                  tag_key = {
                    "@@assign" = "Org.Backup"
                  }
                  tag_value = {
                    "@@assign" = ["Daily"]
                  }
                }
              }
            }
          }
          Weekly_Backup_Plan = {
            regions = {
              "@@assign" = [
                "us-east-1",
                "us-east-2"
              ]
            }
            rules = {
              Weekly_Backup_Rule = {
                target_backup_vault_name = {
                  "@@assign" = "Default"
                }
                schedule_expression = {
                  "@@assign" = "cron(0 5 ? * 7 *)"
                }
                lifecycle = {
                  move_to_cold_storage_after_days = {
                    "@@assign" = "30"
                  }
                  delete_after_days = {
                    "@@assign" = "180"
                  }
                }
              }
            }
            selections = {
              tags = {
                Weekly = {
                  iam_role_arn = {
                    "@@assign" = "arn:aws:iam::$account:role/service-role/AWSBackupDefaultServiceRole"
                  }
                  tag_key = {
                    "@@assign" = "Org.Backup"
                  }
                  tag_value = {
                    "@@assign" = ["Weekly"]
                  }
                }
              }
            }
          }
          Monthly_Backup_Plan = {
            regions = {
              "@@assign" = [
                "us-east-1",
                "us-east-2"
              ]
            }
            rules = {
              Monthly_Backup_Rule = {
                target_backup_vault_name = {
                  "@@assign" = "Default"
                }
                schedule_expression = {
                  "@@assign" = "cron(0 5 1 * ? *)"
                }
                lifecycle = {
                  move_to_cold_storage_after_days = {
                    "@@assign" = "90"
                  }
                  delete_after_days = {
                    "@@assign" = "365"
                  }
                }
              }
            }
            selections = {
              tags = {
                Monthly = {
                  iam_role_arn = {
                    "@@assign" = "arn:aws:iam::$account:role/service-role/AWSBackupDefaultServiceRole"
                  }
                  tag_key = {
                    "@@assign" = "Org.Backup"
                  }
                  tag_value = {
                    "@@assign" = ["Monthly"]
                  }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

The important thing to notice is that workload teams don't need to create backup plans, schedules, or backup selections themselves. Everything is managed centrally through AWS Organizations.

To opt into a backup tier, a team simply tags a supported resource:

```hcl
tags = {
  Org.Backup = "Daily"
}
```

AWS Backup automatically discovers the resource and enrolls it in the corresponding backup plan.

## Conclusion

I really like this approach because it balances governance with flexibility. Platform teams can define backup standards once and apply them across the organization, while workload teams can opt resources into the appropriate backup tier with a simple tag. Managing backups through AWS Organizations also fits naturally into an infrastructure-as-code approach. Backup schedules, retention policies, and organizational standards become version controlled, repeatable, and auditable. Ultimately, we want backups to become easy. When we do _good_ self-service, teams don't need to understand the details of AWS Backup or build backup plans for every workload. They simply tag their resources and inherit the organization's standards.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!

