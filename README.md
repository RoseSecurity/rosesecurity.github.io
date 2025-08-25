[![Typing SVG](https://readme-typing-svg.demolab.com?font=IBM+Plex+Mono&weight=500&size=30&duration=6000&pause=1000&color=FFFFFF&width=435&lines=About+Me%3A)](https://git.io/typing-svg)

> [!IMPORTANT]
> Hey, I'm **RoseSecurity**!
>
> I build tools that make managing infrastructure easier to run and safer to scale. Day-to-day I'm in the Terraform and Go trenches, maintaining widely used modules, authoring providers, and contributing to [Terraform Best Practices](https://www.terraform-best-practices.com/) and [Terraform Proverbs](https://rosesecurity.dev/2024/11/24/terraform-proverbs.html). Beyond infrastructure, I architect data engineering pipelines and specialize in building scalable ML/AI platforms for companies in the cloud. I live in the CLI, am the creator of Red-Teaming TTPs, and am a [MITRE](https://attack.mitre.org/resources/engage-with-attack/contribute/), [OWASP](https://nest.owasp.org/members/RoseSecurity), and [Debian](https://nm.debian.org/person/rosesecurity/) contributor!
>
> If you enjoy my [community code](https://github.com/search?q=author%3Arosesecurity%20type%3Apr%20state%3Aclosed%20is%3Amerged%20-user%3Arosesecurity&type=pullrequests), [blogs](https://rosesecurity.dev/), or [tools](https://github.com/RoseSecurity?tab=repositories), feel free to reach out and connect!

---

[![Typing SVG](https://readme-typing-svg.demolab.com?font=IBM+Plex+Mono&weight=500&size=30&duration=6000&pause=1000&color=FFFFFF&width=435&lines=Terraform+Proverbs%3A)](https://git.io/typing-svg)

```hcl
data "http" "terraform_proverbs" {
  url = "https://rosesecurity.dev/api/v1/terraform-proverbs.json"
}

locals {
  proverbs_response = jsondecode(data.http.terraform_proverbs.response_body)
  proverbs          = [for proverb in local.proverbs_response : proverb.text]
}

output "proverbs" {
  value = local.proverbs
}
```
