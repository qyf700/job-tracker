# Third-party design references

This connector uses an independently implemented, local-only mapping and Moka control layer inspired by the following MIT projects. No upstream runtime, AI service, profile examples or personal data are bundled. Preserve these notices if adapting or distributing this reference material.

## OpenJobAutofill

Repository: https://github.com/Br1an67/OpenJobAutofill
Reviewed commit: 005eda98841b3671ead615ebfde5922f0dfd7c36
Reviewed files: src/content.js (semantic/category gates and candidate plans), src/background.js (value-free profile field catalog).
Borrowed design: structural field catalog, category compatibility, explicit matching reasons and human review. We do not adopt its score-based overwrite policy, external AI calls or broad domain execution.

MIT License

Copyright (c) 2026 Br1an67

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## ResumePilot

Repository: https://github.com/XiaoChangXuan/ResumePilot
Reviewed commit: 702efa031089f9b550abbd7c01e579d4ada7c8c1
Reviewed files: complex-controls.js (scoped candidates, displayed-value readback, bounded settling), autofill.js (repeated-record boundaries).
Borrowed design: scope option discovery to the opened control, wait for actual displayed value, distinguish repeated records and flag count mismatch. We keep only the verified Zhihu/Moka target and do not port general button clicking, profile sync, adding records or automatic submission.

MIT License

Copyright (c) 2026 Resume Autofill MVP contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
