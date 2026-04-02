## Test Case 1:
    We have a child with suspected septic shock. According to the guideline, what should we do first regarding antibiotics and lactate?
## Expected output should contain something like this:
* antibiotics should start as soon as possible
* target is ideally within 1 hour
* blood lactate should be measured in the initial evaluation
* citations should point to the matching retrieved snippets
* the model should not add unsupported details like exact fluid volumes unless those are actually retrieved from context

**Status: [  ] pass / [ ] fail**
---

## Test Case 2:
    For a child with probable sepsis but no shock, what does the guideline say about antibiotic timing?
## Expected output should contain something like this:
* for probable sepsis without shock, perform a time-limited rapid investigation
* if concern for sepsis is substantiated, start antimicrobials as soon as possible after appropriate evaluation
* target is ideally within 3 hours of recognition

**Status: [  ] pass / [ ] fail**
---
## Test Case 3:
    Should we routinely use molecular testing for pathogen detection in children with probable sepsis or suspected septic shock?
## Expected output should contain something like this:
* the guideline does not recommend for or against routine molecular testing
* the answer is insufficient evidence, not “yes” or “no”
* the response stays inside your required format
* the citations support that exact statement
**Status: [  ] pass / [ ] fail**
---