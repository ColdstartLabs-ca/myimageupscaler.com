# Page snapshot

```yaml
- generic [active] [ref=e1]:
    - generic [ref=e7] [cursor=pointer]:
        - button "Open issues overlay" [ref=e8]:
            - img [ref=e10]
            - generic [ref=e12]:
                - generic [ref=e13]: '0'
                - generic [ref=e14]: '1'
            - generic [ref=e15]: Issue
        - button "Collapse issues badge" [ref=e16]:
            - img [ref=e17]
    - generic [ref=e20]:
        - img [ref=e22]
        - generic [ref=e24]:
            - heading "Something went wrong" [level=1] [ref=e25]
            - paragraph [ref=e26]: We encountered an unexpected error. Please try again or go back to the homepage.
            - group [ref=e27]:
                - generic "Error details (dev only)" [ref=e28] [cursor=pointer]
        - generic [ref=e29]:
            - button "Try Again" [ref=e30] [cursor=pointer]:
                - img [ref=e31]
                - text: Try Again
            - link "Go Home" [ref=e36] [cursor=pointer]:
                - /url: /
                - img [ref=e37]
                - text: Go Home
    - alert [ref=e40]
```
