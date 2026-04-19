#!/usr/bin/env python3
"""Demo: Basic Python functionality"""

def main():
    # String operations
    print("=" * 50)
    print("🐍 Python Code Execution Demo")
    print("=" * 50)
    
    # Demonstrating data types
    greeting = "Hello from Python!"
    numbers = [1, 2, 3, 4, 5]
    data = {"name": "OpenAgents", "status": "running", "version": 1.0}
    
    print(f"\n📝 String: {greeting}")
    print(f"🔢 Numbers: {numbers}")
    print(f"📊 Dictionary: {data}")
    
    # Calculations
    total = sum(numbers)
    average = total / len(numbers)
    print(f"\n🧮 Sum: {total}, Average: {average}")
    
    # List comprehension
    squares = [x**2 for x in numbers]
    print(f"⚡ Squares: {squares}")
    
    # JSON-like structure
    import json
    config = {
        "app": "Demo Script",
        "features": ["code execution", "file I/O", "data processing"],
        "status": "success"
    }
    print(f"\n📦 JSON Output:")
    print(json.dumps(config, indent=2))
    
    print("\n" + "=" * 50)
    print("✅ Demo completed successfully!")
    print("=" * 50)

if __name__ == "__main__":
    main()