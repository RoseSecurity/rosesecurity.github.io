# Infrastructure Essentials Part 1: A Terraform Recipe for Success

## From Home Cooking to Restaurant Scale

It has become increasingly easy to find articles on Medium or `Dev.to` about writing basic Infrastructure-as-Code, spinning up EC2 instances, and adding Terraform to your resume. While Terraform is easy to get started with, managing it at scale can lead to a lot of headaches if the initial configuration and setup were not designed with scalability in mind. In this series, we will dive into my essential tips, tricks, and tools that I consistently use in my Terraform projects. While this list is not exhaustive (it's easy to get lost in the tooling ecosystem sauce), it will help you get started on the journey of building, using, and maintaining Terraform modules and code throughout your project's lifecycle.

## Keeping the Kitchen Clean

If you have ever worked in the food industry, you know that cleanliness is crucial for providing quality food. I recall a favorite restaurant of mine that had to close because sewage pipes were leaking into the stove area of the kitchen. To ensure a sustainable operation (and not have poop leaking into our code), it is essential to maintain a clean kitchen. Let's discuss tools and configurations that can help you keep your Terraform code clean, easy to maintain, and sustainable.

### 1. `EditorConfig`: Ensure consistency when multiple chefs are cooking medium rare steaks in the kitchen.

EditorConfig helps maintain consistent coding styles for multiple developers working on the same project across various editors and IDEs. 

> :exclamation: There's nothing more infuriating than developers using conflicting YAML formatters, resulting in commits with 1,000 changes due to a plugin adjusting the spacing by two lines

I digress. The following is an `.editorconfig` that can be placed in the root of your project to keep everyone's IDE on the same page:

```ini
# Unix-style newlines with a newline ending every file
[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.{tf,tfvars}]
indent_size = 2
indent_style = space

[*.md]
max_line_length = 0
trim_trailing_whitespace = false

# Override for Makefile
[{Makefile, makefile, GNUmakefile, Makefile.*}]
tab_width = 2
indent_style = tab
indent_size = 4

[COMMIT_EDITMSG]
max_line_length = 0
```

### 2. `.gitignore`: Ensure chefs aren't sending the recipe out to customers

The purpose of `.gitignore` files is to ensure that certain files remain untracked by Git. This is useful for preventing unnecessary or sensitive files from being checked into version control. By specifying patterns in a `.gitignore` file, you can exclude files such as build artifacts, temporary files, and configuration files that may contain sensitive information (such as a state file). Below is an example of a `.gitignore` file for Terraform:

```ini
# Local .terraform directories
**/.terraform/*

# Terraform lockfile
.terraform.lock.hcl

# .tfstate files
*.tfstate
*.tfstate.*

# Crash log files
crash.log

# Exclude all .tfvars files, which are likely to contain sentitive data, such as
# password, private keys, and other secrets. These should not be part of version
# control as they are data points which are potentially sensitive and subject
# to change depending on the environment.
*.tfvars

# Ignore override files as they are usually used to override resources locally and so
# are not checked in
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Ignore CLI configuration files
.terraformrc
terraform.rc
```

### 3. `Pre-Commit` Goodness: Have an expediter ensure that dishes are properly cooked and plated before sending them out of the kitchen

Before committing Terraform to version control, it is important to ensure that it is properly formatted, validated, linted for any potential errors, and has clean documentation. By addressing these issues before code review, a code reviewer can focus on the architecture (or lack thereof) of a change without wasting time on trivial style nitpicks. Use the following example for Terraform, but you can also find a more extensive collection of Terraform Pre-Commit hooks at [pre-commit-terraform](https://github.com/antonbabenko/pre-commit-terraform):

```yaml
repos:
  # pre-commit install --hook-type pre-push
  - repo: https://github.com/pre-commit/pre-commit-hooks # Generic review/format
    rev: v4.6.0
    hooks:
      - id: end-of-file-fixer
      - id: no-commit-to-branch
        args: ["--branch", "master"]
      - id: trailing-whitespace
  - repo: https://github.com/igorshubovych/markdownlint-cli # Format markdown
    rev: v0.40.0
    hooks:
      - id: markdownlint
        args: ["--fix", "--disable", "MD036"]
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.89.1 # Get the latest from: https://github.com/antonbabenko/pre-commit-terraform/releases
    hooks:
      - id: terraform_fmt
      - id: terraform_tflint
      - id: terraform_validate
        args:
          - --args=-json
          - --args=-no-color
      - id: terraform_docs
        args:
          - --hook-config=--path-to-file=README.md
          - --hook-config=--add-to-existing-file=true
```

## Closing Time

I hope that this article emphasized the importance of maintaining clean and sustainable Terraform codebases. So far, we have introduced practical tools and configurations, such as `EditorConfig` for consistent coding styles, a `.gitignore` file to keep sensitive data out of version control, and Pre-Commit hooks for ensuring code quality before commits. These essentials serve as the foundation for building, using, and maintaining Terraform modules and code efficiently. As we continue this series, the next installment will delve into Terraform testing, exploring strategies and tools to ensure your infrastructure code is not only scalable and maintainable but also robust and error-free. If you have any questions, enjoyed the content, or would like to check out more of my code, feel free to visit my [GitHub](https://github.com/RoseSecurity).

