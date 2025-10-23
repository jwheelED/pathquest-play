import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get JWT from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's JWT (not service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { goal, experienceLevel } = await req.json();
    
    // Input validation
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0 || goal.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Invalid goal parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
    if (!experienceLevel || !validLevels.includes(experienceLevel)) {
      return new Response(
        JSON.stringify({ error: 'Invalid experience level' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // CRITICAL: Use authenticated user's ID, not request parameter
    const userId = user.id;

    // Delete existing lessons for this user
    await supabase
      .from("lessons")
      .delete()
      .eq("user_id", userId);

    // Generate lessons based on goal and experience level
    const lessons = generateLessons(goal, experienceLevel);

    // Insert lessons with content
    const { error: insertError } = await supabase
      .from("lessons")
      .insert(
        lessons.map((lesson, index) => ({
          user_id: userId,
          title: lesson.title,
          type: lesson.type,
          step_number: index + 1,
          content: JSON.stringify(lesson.content),
        }))
      );

    if (insertError) throw insertError;

    // Initialize user stats if they don't exist
    const { error: statsError } = await supabase
      .from("user_stats")
      .upsert({
        user_id: userId,
        experience_points: 0,
        level: 1,
        coins: 0,
        current_streak: 0,
        longest_streak: 0,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: true
      });

    if (statsError) throw statsError;

    return new Response(
      JSON.stringify({ success: true, lessonsCount: lessons.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating path:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateLessons(goal: string, experienceLevel: string) {
  const goalLower = goal.toLowerCase();
  
  // Determine the topic area
  if (goalLower.includes("javascript") || goalLower.includes("js")) {
    return generateJavaScriptPath(experienceLevel);
  } else if (goalLower.includes("python")) {
    return generatePythonPath(experienceLevel);
  } else if (goalLower.includes("c++") || goalLower.includes("cpp")) {
    return generateCppPath(experienceLevel);
  } else if (goalLower.includes("machine learning") || goalLower.includes("ml") || goalLower.includes("ai")) {
    return generateMLPath(experienceLevel);
  } else if (goalLower.includes("math") || goalLower.includes("algebra") || goalLower.includes("geometry")) {
    return generateMathPath(experienceLevel);
  } else {
    return generateGenericPath(goal, experienceLevel);
  }
}

function generateJavaScriptPath(level: string) {
  if (level === "Beginner") {
    return [
      {
        title: "Introduction to JavaScript",
        type: "Lesson",
        content: {
          text: `# Introduction to JavaScript\n\n## What is JavaScript?\nJavaScript is the programming language of the web. It makes websites interactive and dynamic. Every modern website you use has JavaScript running behind the scenes!\n\n## Why Learn JavaScript?\n- **Most popular programming language**: Used by millions of developers\n- **Versatile**: Build websites, mobile apps, servers, and even games\n- **High demand**: JavaScript developers are in high demand worldwide\n- **Beginner friendly**: Great first programming language\n\n## How JavaScript Works\nJavaScript runs in your web browser and can:\n- Respond to button clicks\n- Update content without reloading the page\n- Create animations and effects\n- Validate forms before submission\n- Store data locally\n\n## Your First JavaScript Code\nHere's a simple example:\n\njavascript\nconsole.log("Hello, World!");\n\n\nThis prints "Hello, World!" to the browser console.\n\n## JavaScript in HTML\nJavaScript is embedded in HTML using <script> tags:\n\nhtml\n<script>\n  alert("Welcome to JavaScript!");\n</script>\n\n\n## Key Concepts You'll Learn\n1. **Variables**: Store and manage data\n2. **Functions**: Reusable blocks of code\n3. **Objects**: Organize related data\n4. **Events**: Respond to user actions\n5. **DOM Manipulation**: Change webpage content\n\n## Tools You Need\n- A web browser (Chrome, Firefox, Safari)\n- A text editor (VS Code, Sublime Text)\n- That's it! No complex setup required\n\n## Getting Started\nJavaScript is forgiving for beginners. You can:\n- Try code immediately in the browser console\n- See results instantly\n- Learn by experimenting\n\n## Real-World Applications\n- **Facebook**: Interactive news feed\n- **Google Maps**: Dynamic map interactions\n- **Netflix**: Smooth video playback\n- **Spotify**: Web player controls\n\n## Your Learning Journey\nMastering JavaScript opens doors to:\n- Front-end development (React, Vue, Angular)\n- Back-end development (Node.js)\n- Mobile apps (React Native)\n- Desktop apps (Electron)\n\n## Remember\nEvery expert programmer started as a beginner. Be patient, practice regularly, and don't be afraid to make mistakes!`
        }
      },
      {
        title: "JavaScript Variables and Data Types",
        type: "Lesson",
        content: {
          text: `# Variables and Data Types\n\n## What are Variables?\nVariables are containers that store data. Think of them as labeled boxes where you keep information.\n\n## Declaring Variables\nJavaScript has three ways to declare variables:\n\n### let (Modern, Recommended)\njavascript\nlet name = "Alice";\nlet age = 25;\nlet isStudent = true;\n\n\n### const (For Constants)\njavascript\nconst PI = 3.14159;\nconst DAYS_IN_WEEK = 7;\n// Cannot be reassigned!\n\n\n### var (Old Style, Avoid)\njavascript\nvar oldStyle = "Not recommended";\n\n\n## Data Types in JavaScript\n\n### 1. String (Text)\njavascript\nlet greeting = "Hello!";\nlet name = 'Bob';\nlet message = Welcome, everyone;\n\n\n### 2. Number\njavascript\nlet age = 30;\nlet price = 19.99;\nlet temperature = -5;\n\n\n### 3. Boolean (True/False)\njavascript\nlet isLoggedIn = true;\nlet hasPermission = false;\n\n\n### 4. Undefined\njavascript\nlet notAssigned;\nconsole.log(notAssigned); // undefined\n\n\n### 5. Null (Intentionally Empty)\njavascript\nlet emptyValue = null;\n\n\n## Naming Rules\n- Start with letter, $, or _\n- Use camelCase: firstName, userAge\n- Be descriptive: studentCount not x\n- Case sensitive: age ≠ Age\n\n## Type Checking\njavascript\ntypeof "hello"  // "string"\ntypeof 42       // "number"\ntypeof true     // "boolean"\n\n\n## String Operations\njavascript\nlet first = "Hello";\nlet last = "World";\nlet full = first + " " + last; // "Hello World"\n\n// Template literals (modern)\nlet message = Hello, \\${name}!;\n\n\n## Number Operations\njavascript\nlet sum = 5 + 3;        // 8\nlet difference = 10 - 4; // 6\nlet product = 6 * 7;     // 42\nlet quotient = 15 / 3;   // 5\nlet remainder = 17 % 5;  // 2\n\n\n## Type Conversion\njavascript\nlet str = "123";\nlet num = Number(str);  // 123\nlet back = String(num); // "123"\n\n\n## Common Mistakes to Avoid\n1. Forgetting to declare variables\n2. Using var instead of let/const\n3. Reassigning const variables\n4. Case sensitivity errors\n\n## Best Practices\n- Use const by default\n- Use let only when reassigning\n- Choose meaningful names\n- One variable per line\n\n## Practice Exercise\njavascript\n// Store your name, age, and favorite color\nlet myName = "Your Name";\nlet myAge = 25;\nlet favoriteColor = "blue";\n\nconsole.log("My name is " + myName);\nconsole.log("I am " + myAge + " years old");\n\n\n## Key Takeaways\n- Variables store data\n- Use let for changeable values\n- Use const for fixed values\n- Strings for text, numbers for math\n- Choose descriptive names`
        }
      },
      {
        title: "Variables Quiz",
        type: "Quiz",
        content: {
          questions: [
            {
              question: "Which keyword should you use for a value that won't change?",
              options: ["let", "const", "var", "static"],
              correct: 1
            },
            {
              question: "What data type is 'Hello World'?",
              options: ["Number", "String", "Boolean", "Object"],
              correct: 1
            },
            {
              question: "Which is a valid variable name?",
              options: ["2ndPlace", "user-name", "firstName", "let"],
              correct: 2
            },
            {
              question: "What does typeof 42 return?",
              options: ["'number'", "'integer'", "'string'", "'digit'"],
              correct: 0
            }
          ]
        }
      },
      {
        title: "JavaScript Functions",
        type: "Lesson",
        content: {
          text: `# Functions in JavaScript\n\n## What are Functions?\nFunctions are reusable blocks of code that perform specific tasks. They're like recipes you can use over and over!\n\n## Why Use Functions?\n- **Reusability**: Write once, use many times\n- **Organization**: Keep code clean and manageable\n- **Abstraction**: Hide complex logic\n- **Maintainability**: Update in one place\n\n## Function Declaration\njavascript\nfunction greet(name) {\n  return Hello, ${name}!;\n}\n\nlet message = greet("Alice"); // "Hello, Alice!"\n\n\n## Function Parts\n1. **function** keyword\n2. **Name**: greet\n3. **Parameters**: (name)\n4. **Body**: { ... }\n5. **Return**: value to output\n\n## Parameters and Arguments\njavascript\nfunction add(a, b) {  // a, b are parameters\n  return a + b;\n}\n\nlet sum = add(5, 3);  // 5, 3 are arguments\nconsole.log(sum);     // 8\n\n\n## Arrow Functions (Modern)\njavascript\nconst greet = (name) => {\n  return Hello, ${name}!;\n};\n\n// Shorthand for simple returns\nconst double = (x) => x * 2;\n\n\n## Default Parameters\njavascript\nfunction greet(name = "Guest") {\n  return Welcome, ${name}!;\n}\n\ngreet();        // "Welcome, Guest!"\ngreet("Bob");   // "Welcome, Bob!"\n\n\n## Multiple Returns\njavascript\nfunction checkAge(age) {\n  if (age >= 18) {\n    return "Adult";\n  } else {\n    return "Minor";\n  }\n}\n\n\n## Function Scope\njavascript\nlet globalVar = "I'm global";\n\nfunction test() {\n  let localVar = "I'm local";\n  console.log(globalVar);  // Works!\n  console.log(localVar);   // Works!\n}\n\ntest();\nconsole.log(localVar); // Error! Not accessible\n\n\n## Callback Functions\njavascript\nfunction processUser(name, callback) {\n  console.log(Processing ${name}...);\n  callback();\n}\n\nprocessUser("Alice", () => {\n  console.log("Done!");\n});\n\n\n## Common Use Cases\n\n### 1. Calculations\njavascript\nfunction calculateTotal(price, tax) {\n  return price + (price * tax);\n}\n\n\n### 2. Validation\njavascript\nfunction isValidEmail(email) {\n  return email.includes("@");\n}\n\n\n### 3. Data Transformation\njavascript\nfunction capitalize(str) {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n\n\n## Best Practices\n1. One function, one purpose\n2. Use descriptive names (verbs)\n3. Keep functions short\n4. Avoid side effects\n5. Always return a value\n\n## Common Mistakes\n- Forgetting return statement\n- Not calling function with ()\n- Wrong number of arguments\n- Scope confusion\n\n## Practice Exercise\njavascript\n// Create a function that calculates area\nfunction calculateArea(width, height) {\n  return width * height;\n}\n\nconsole.log(calculateArea(5, 10)); // 50\n\n// Create a function that checks even/odd\nfunction isEven(num) {\n  return num % 2 === 0;\n}\n\nconsole.log(isEven(4));  // true\nconsole.log(isEven(7));  // false\n\n\n## Key Takeaways\n- Functions make code reusable\n- Use parameters for input\n- Use return for output\n- Arrow functions are concise\n- Keep functions focused and simple`
        }
      },
      {
        title: "Functions Practice",
        type: "Lesson",
        content: {
          instructions: "Practice creating and using JavaScript functions. Write clean, working code for each task.",
          tasks: [
            "Create a function called 'multiply' that takes two numbers and returns their product",
            "Write a function 'isPositive' that returns true if a number is greater than 0",
            "Create a function 'getFullName' that takes firstName and lastName and returns them combined",
            "Write a function 'celsiusToFahrenheit' that converts temperature (formula: F = C * 9/5 + 32)",
            "Create a function 'findMax' that takes two numbers and returns the larger one"
          ]
        }
      },
      {
        title: "Build a Simple Calculator Project",
        type: "Lesson",
        content: {
          instructions: "Create a simple calculator using JavaScript functions to demonstrate your understanding.",
          requirements: [
            "Create four functions: add, subtract, multiply, and divide",
            "Each function should take two numbers as parameters and return the result",
            "Test each function with different numbers and log the results",
            "Add error handling for division by zero",
            "Create a main function that calls all calculator functions and displays results in a organized format"
          ]
        }
      }
    ];
  }
  return generateGenericPath("JavaScript", level);
}

function generatePythonPath(level: string) {
  return [
    {
      title: "Introduction to Python",
      type: "Lesson",
      content: {
        text: `# Introduction to Python\n\n## What is Python?\nPython is a versatile, beginner-friendly programming language known for its readable syntax and powerful capabilities.\n\n## Why Learn Python?\n- **Easy to Learn**: Clean, readable syntax\n- **Versatile**: Web development, data science, AI, automation\n- **In-Demand**: Top language for jobs in tech\n- **Great Community**: Extensive libraries and support\n\n## Your First Python Program\n\`\`\`python\nprint("Hello, World!")\n\`\`\`\n\nThat's it! Python is that simple.\n\n## Key Features\n1. **No Compilation**: Run code directly\n2. **Dynamic Typing**: Variables don't need type declarations\n3. **Extensive Libraries**: Tools for almost everything\n4. **Cross-Platform**: Works on Windows, Mac, Linux\n\n## Applications\n- **Web Development**: Django, Flask\n- **Data Science**: Pandas, NumPy, Matplotlib\n- **Machine Learning**: TensorFlow, PyTorch\n- **Automation**: Scripting, testing\n\nLet's start coding!`
      }
    },
    {
      title: "Python Basics",
      type: "Lesson",
      content: {
        text: `# Python Basics\n\n## Variables\n\`\`\`python\nname = "Alice"\nage = 25\nheight = 5.7\nis_student = True\n\`\`\`\n\n## Data Types\n- **int**: Whole numbers\n- **float**: Decimal numbers\n- **str**: Text\n- **bool**: True/False\n\n## Basic Operations\n\`\`\`python\n# Math\nsum = 5 + 3\nproduct = 4 * 7\n\n# Strings\ngreeting = "Hello" + " " + "World"\n\n# Print\nprint(f"My name is {name}")\n\`\`\`\n\n## Lists\n\`\`\`python\nfruits = ["apple", "banana", "orange"]\nprint(fruits[0])  # "apple"\nfruits.append("grape")\n\`\`\`\n\n## Control Flow\n\`\`\`python\nif age >= 18:\n    print("Adult")\nelse:\n    print("Minor")\n\nfor fruit in fruits:\n    print(fruit)\n\`\`\`\n\n## Functions\n\`\`\`python\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Bob"))\n\`\`\``
      }
    },
    {
      title: "Python Quiz",
      type: "Quiz",
      content: {
        questions: [
          {
            question: "How do you print 'Hello' in Python?",
            options: ["echo('Hello')", "print('Hello')", "console.log('Hello')", "cout << 'Hello'"],
            correct: 1
          },
          {
            question: "What symbol is used for comments in Python?",
            options: ["//", "/*", "#", "--"],
            correct: 2
          },
          {
            question: "How do you create a list in Python?",
            options: ["list = (1, 2, 3)", "list = {1, 2, 3}", "list = [1, 2, 3]", "list = <1, 2, 3>"],
            correct: 2
          }
        ]
      }
    },
    {
      title: "Python Practice",
      type: "Lesson",
      content: {
        text: `# Practice Exercises\n\nWork through these exercises:\n\n1. Create variables for your name, age, and favorite color\n2. Write a function that adds two numbers\n3. Create a list of 5 numbers and print each one\n4. Write an if-statement to check if a number is even\n5. Create a simple calculator that adds, subtracts, multiplies, and divides`
      }
    },
    {
      title: "Python Mini Project",
      type: "Lesson",
      content: {
        text: `# Build a Number Guessing Game\n\n\`\`\`python\nimport random\n\nnumber = random.randint(1, 100)\nguesses = 0\n\nprint("Guess a number between 1 and 100!")\n\nwhile True:\n    guess = int(input("Your guess: "))\n    guesses += 1\n    \n    if guess < number:\n        print("Too low!")\n    elif guess > number:\n        print("Too high!")\n    else:\n        print(f"Correct! You guessed in {guesses} tries!")\n        break\n\`\`\``
      }
    }
  ];
}

function generateCppPath(level: string) {
  // Return comprehensive content for all levels, not just beginners
  return [
    {
      title: "Introduction to C++",
      type: "Lesson",
      content: {
        text: `# Introduction to C++\n\n## What is C++?\nC++ is a powerful, high-performance programming language used for system software, game development, and applications requiring speed and efficiency.\n\n## Why Learn C++?\n- **High Performance**: Direct hardware control and memory management\n- **Industry Standard**: Used in game engines, operating systems, and embedded systems\n- **Object-Oriented**: Supports modern programming paradigms\n- **Career Opportunities**: High demand for C++ developers\n\n## Your First C++ Program\n\`\`\`cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n\`\`\`\n\n## Key Concepts\n1. **Compiled Language**: C++ code is compiled into machine code\n2. **Static Typing**: Variable types are checked at compile time\n3. **Memory Management**: Direct control over memory allocation\n4. **Templates**: Generic programming capabilities\n\n## Getting Started\nYou'll need:\n- A C++ compiler (GCC, Clang, or MSVC)\n- A text editor or IDE (VS Code, Visual Studio, or CLion)\n\n## Real-World Applications\n- **Game Engines**: Unreal Engine, Unity (core)\n- **Operating Systems**: Windows, Linux, macOS components\n- **Browsers**: Chrome, Firefox\n- **Databases**: MySQL, MongoDB\n\nLet's start your C++ journey!`
      }
    },
    {
      title: "Variables and Data Types",
      type: "Lesson",
      content: {
        text: `# Variables and Data Types in C++\n\n## Declaring Variables\nC++ requires explicit type declaration:\n\n\`\`\`cpp\nint age = 25;\ndouble price = 19.99;\nchar grade = 'A';\nbool isPassing = true;\nstring name = "Alice";\n\`\`\`\n\n## Basic Data Types\n\n### Integer Types\n\`\`\`cpp\nint x = 42;        // Standard integer\nlong y = 1000000L; // Long integer\nshort z = 100;     // Short integer\n\`\`\`\n\n### Floating Point\n\`\`\`cpp\nfloat pi = 3.14f;      // Single precision\ndouble precise = 3.14159; // Double precision\n\`\`\`\n\n### Character and String\n\`\`\`cpp\nchar letter = 'A';\nstring text = "Hello, C++!";\n\`\`\`\n\n### Boolean\n\`\`\`cpp\nbool isTrue = true;\nbool isFalse = false;\n\`\`\`\n\n## Type Modifiers\n\`\`\`cpp\nunsigned int positive = 100; // Only positive values\nconst double PI = 3.14159;   // Cannot be changed\n\`\`\`\n\n## Input and Output\n\`\`\`cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    string name;\n    int age;\n    \n    cout << "Enter your name: ";\n    cin >> name;\n    \n    cout << "Enter your age: ";\n    cin >> age;\n    \n    cout << "Hello " << name << ", you are " << age << " years old." << endl;\n    \n    return 0;\n}\n\`\`\`\n\n## Best Practices\n- Use meaningful variable names\n- Initialize variables when declaring\n- Use const for values that won't change\n- Choose appropriate data types for efficiency`
      }
    },
    {
      title: "C++ Basics Quiz",
      type: "Quiz",
      content: {
        questions: [
          {
            question: "Which header file is needed for input/output in C++?",
            options: ["<stdio.h>", "<iostream>", "<string>", "<cmath>"],
            correct: 1
          },
          {
            question: "What is the correct way to declare an integer variable?",
            options: ["integer x = 5;", "int x = 5;", "var x = 5;", "number x = 5;"],
            correct: 1
          },
          {
            question: "Which keyword makes a variable unchangeable?",
            options: ["final", "static", "const", "readonly"],
            correct: 2
          },
          {
            question: "What does 'endl' do in C++?",
            options: ["Ends the program", "Creates a new line", "Ends a loop", "Defines a variable"],
            correct: 1
          }
        ]
      }
    },
    {
      title: "Control Structures",
      type: "Lesson",
      content: {
        text: `# Control Structures in C++\n\n## If Statements\n\`\`\`cpp\nint age = 18;\n\nif (age >= 18) {\n    cout << "Adult" << endl;\n} else {\n    cout << "Minor" << endl;\n}\n\`\`\`\n\n## Loops\n\n### For Loop\n\`\`\`cpp\nfor (int i = 0; i < 5; i++) {\n    cout << i << " ";\n}\n// Output: 0 1 2 3 4\n\`\`\`\n\n### While Loop\n\`\`\`cpp\nint count = 0;\nwhile (count < 5) {\n    cout << count << " ";\n    count++;\n}\n\`\`\`\n\n### Do-While Loop\n\`\`\`cpp\nint num = 0;\ndo {\n    cout << num << " ";\n    num++;\n} while (num < 5);\n\`\`\`\n\n## Switch Statements\n\`\`\`cpp\nint choice = 2;\nswitch(choice) {\n    case 1:\n        cout << "Option 1" << endl;\n        break;\n    case 2:\n        cout << "Option 2" << endl;\n        break;\n    default:\n        cout << "Invalid option" << endl;\n}\n\`\`\`\n\n## Practice Tips\n- Use loops to avoid repeating code\n- Choose the right control structure for the task\n- Always test edge cases\n- Remember to use break in switch statements`
      }
    },
    {
      title: "C++ Calculator Project",
      type: "Lesson",
      content: {
        text: `# Build a C++ Calculator\n\n## Project Goal\nCreate a simple calculator that performs basic arithmetic operations.\n\n## Complete Code Example\n\`\`\`cpp\n#include <iostream>\nusing namespace std;\n\nint main() {\n    double num1, num2;\n    char operation;\n    \n    cout << "Enter first number: ";\n    cin >> num1;\n    \n    cout << "Enter operation (+, -, *, /): ";\n    cin >> operation;\n    \n    cout << "Enter second number: ";\n    cin >> num2;\n    \n    switch(operation) {\n        case '+':\n            cout << "Result: " << (num1 + num2) << endl;\n            break;\n        case '-':\n            cout << "Result: " << (num1 - num2) << endl;\n            break;\n        case '*':\n            cout << "Result: " << (num1 * num2) << endl;\n            break;\n        case '/':\n            if (num2 != 0) {\n                cout << "Result: " << (num1 / num2) << endl;\n            } else {\n                cout << "Error: Division by zero!" << endl;\n            }\n            break;\n        default:\n            cout << "Invalid operation!" << endl;\n    }\n    \n    return 0;\n}\n\`\`\`\n\n## Enhancement Ideas\n1. Add error handling for invalid inputs\n2. Support multiple operations in sequence\n3. Add power and modulo operations\n4. Create a loop to perform multiple calculations\n5. Add a menu system for better user experience\n\n## What You Learned\n- User input with cin\n- Switch statements for multiple conditions\n- Type casting and arithmetic operations\n- Error handling for edge cases\n- Program flow control`
      }
    }
  ];
}

function generateMLPath(level: string) {
  return generateGenericPath("Machine Learning", level);
}

function generateMathPath(level: string) {
  if (level === "Beginner") {
    return [
      { title: "Introduction to Fractions", type: "Lesson", content: {} },
      { title: "Fractions Quiz", type: "Quiz", content: {} },
      { title: "Fraction Practice Problems", type: "Lesson", content: {} },
      { title: "Basic Algebra Concepts", type: "Lesson", content: {} },
      { title: "Algebra Practice", type: "Lesson", content: {} },
    ];
  }
  return generateGenericPath("Mathematics", level);
}

function generateGenericPath(goal: string, level: string) {
  return [
    { title: `Introduction to ${goal}`, type: "Lesson", content: {} },
    { title: `${goal} Fundamentals`, type: "Lesson", content: {} },
    { title: `${goal} Quiz`, type: "Quiz", content: {} },
    { title: `${goal} Practice Exercises`, type: "Lesson", content: {} },
    { title: `${goal} Final Project`, type: "Lesson", content: {} },
  ];
}
