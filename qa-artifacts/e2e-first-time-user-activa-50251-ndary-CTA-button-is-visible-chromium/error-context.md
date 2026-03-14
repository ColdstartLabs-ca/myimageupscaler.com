# Page snapshot

```yaml
- generic [active] [ref=e1]:
    - generic [ref=e3]:
        - img [ref=e5]
        - generic [ref=e7]:
            - heading "Something went wrong" [level=1] [ref=e8]
            - paragraph [ref=e9]: We encountered an unexpected error. Please try again or go back to the homepage.
            - group [ref=e10]:
                - generic "Error details (dev only)" [ref=e11] [cursor=pointer]
        - generic [ref=e12]:
            - button "Try Again" [ref=e13] [cursor=pointer]:
                - img [ref=e14]
                - text: Try Again
            - link "Go Home" [ref=e19] [cursor=pointer]:
                - /url: /
                - img [ref=e20]
                - text: Go Home
    - alert [ref=e23]
```
