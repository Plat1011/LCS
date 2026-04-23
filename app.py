from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from flask import Flask, jsonify, request, send_from_directory


@dataclass
class State:
    id: int
    length: int = 0
    link: int = -1
    transitions: Dict[str, int] = field(default_factory=dict)


class SuffixAutomaton:
    def __init__(self) -> None:
        self.states: List[State] = [State(id=0)]
        self.last = 0

    def extend(self, ch: str) -> None:
        cur = len(self.states)
        self.states.append(State(id=cur, length=self.states[self.last].length + 1))

        p = self.last
        while p >= 0 and ch not in self.states[p].transitions:
            self.states[p].transitions[ch] = cur
            p = self.states[p].link

        if p == -1:
            self.states[cur].link = 0
        else:
            q = self.states[p].transitions[ch]
            if self.states[p].length + 1 == self.states[q].length:
                self.states[cur].link = q
            else:
                clone = len(self.states)
                self.states.append(
                    State(
                        id=clone,
                        length=self.states[p].length + 1,
                        link=self.states[q].link,
                        transitions=self.states[q].transitions.copy(),
                    )
                )
                while p >= 0 and self.states[p].transitions.get(ch) == q:
                    self.states[p].transitions[ch] = clone
                    p = self.states[p].link
                self.states[q].link = clone
                self.states[cur].link = clone

        self.last = cur

    @classmethod
    def from_string(cls, s: str) -> "SuffixAutomaton":
        sam = cls()
        for ch in s:
            sam.extend(ch)
        return sam

    def to_graph(self) -> Dict[str, List[Dict[str, object]]]:
        nodes = [
            {
                "id": st.id,
                "label": f"q{st.id}",
                "length": st.length,
                "link": st.link,
                "isTerminal": self._is_terminal(st.id),
            }
            for st in self.states
        ]

        edges = []
        for st in self.states:
            for ch, to in st.transitions.items():
                edges.append({"from": st.id, "to": to, "char": ch})

        suffix_links = [
            {"from": st.id, "to": st.link}
            for st in self.states
            if st.link >= 0 and st.id != 0
        ]

        return {"nodes": nodes, "edges": edges, "suffixLinks": suffix_links}

    def _is_terminal(self, state_id: int) -> bool:
        cur = self.last
        while cur > 0:
            if cur == state_id:
                return True
            cur = self.states[cur].link
        return state_id == 0

    def traverse_lcs(self, t: str) -> Dict[str, object]:
        v = 0
        l = 0
        best_len = 0
        best_pos = -1
        steps: List[Dict[str, object]] = []

        for i, ch in enumerate(t):
            while v != 0 and ch not in self.states[v].transitions:
                v = self.states[v].link
                l = self.states[v].length

            if ch in self.states[v].transitions:
                v = self.states[v].transitions[ch]
                l += 1
            else:
                v = 0
                l = 0

            if l > best_len:
                best_len = l
                best_pos = i

            steps.append(
                {
                    "index": i,
                    "char": ch,
                    "state": v,
                    "currentLength": l,
                    "currentSubstring": t[i - l + 1 : i + 1] if l > 0 else "",
                    "bestLength": best_len,
                    "bestSubstring": t[best_pos - best_len + 1 : best_pos + 1] if best_len > 0 else "",
                }
            )

        lcs = t[best_pos - best_len + 1 : best_pos + 1] if best_len > 0 else ""
        return {"lcs": lcs, "length": best_len, "steps": steps}


app = Flask(__name__, static_folder="static")


@app.get("/")
def index() -> object:
    return send_from_directory("static", "index.html")


@app.post("/api/build")
def build_automaton() -> object:
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", ""))

    if not source:
        return jsonify({"error": "Введите исходную строку."}), 400

    sam = SuffixAutomaton.from_string(source)
    return jsonify({"source": source, "graph": sam.to_graph()})


@app.post("/api/lcs")
def run_lcs() -> object:
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", ""))
    target = str(payload.get("target", ""))

    if not source or not target:
        return jsonify({"error": "Нужно заполнить обе строки."}), 400

    sam = SuffixAutomaton.from_string(source)
    result = sam.traverse_lcs(target)
    result["graph"] = sam.to_graph()
    result["source"] = source
    result["target"] = target
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
